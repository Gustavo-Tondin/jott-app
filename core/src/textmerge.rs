//! Three-way merge of plain text, line by line — what a note's conflict copy
//! goes through. Same shape as the list merge: the content the devices had in
//! COMMON, this device's version, and the copy the sync tool left.
//!
//! A line neither side touched is the anchor; a run only one side rewrote is
//! that side's. A run BOTH rewrote is not settled here and nothing is
//! written: conflict markers inside somebody's note would be the app
//! corrupting the file it was asked to protect. The copy stays, and the
//! notice says how many lines differ.

/// What merging two versions of a text produced.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TextMerge {
    /// Nobody touched the same lines: this is the text to write.
    Merged(String),
    /// Both devices rewrote the same passage. Nothing was written; `lines` is
    /// how many lines they disagree about, which is what the user is told.
    Clash { lines: usize },
}

/// How large a comparison is worth doing. Past it the merge gives up and the
/// copy goes to the banner: a note that long is a book, and the table would
/// be tens of megabytes. Counted in cells AFTER the common head and tail are
/// trimmed, so the usual "one paragraph changed in a long note" is tiny.
const MAX_CELLS: usize = 4_000_000;

pub fn merge_text(base: &str, ours: &str, theirs: &str) -> TextMerge {
    if ours == theirs {
        return TextMerge::Merged(ours.to_string());
    }
    if ours == base {
        return TextMerge::Merged(theirs.to_string());
    }
    if theirs == base {
        return TextMerge::Merged(ours.to_string());
    }

    let common: Vec<&str> = base.lines().collect();
    let mine: Vec<&str> = ours.lines().collect();
    let yours: Vec<&str> = theirs.lines().collect();

    let (Some(to_mine), Some(to_yours)) = (
        line_map(&common, &mine),
        line_map(&common, &yours),
    ) else {
        return TextMerge::Clash { lines: apart(&mine, &yours) };
    };

    let mut out: Vec<&str> = Vec::new();
    let mut disputed = 0;
    let (mut at, mut at_mine, mut at_yours) = (0, 0, 0);

    loop {
        let anchor = (at..common.len()).find_map(|k| match (to_mine[k], to_yours[k]) {
            (Some(x), Some(y)) if x >= at_mine && y >= at_yours => Some((k, x, y)),
            _ => None,
        });
        let (k, x, y) = anchor.unwrap_or((common.len(), mine.len(), yours.len()));

        // Everything between the last anchor and this one: whoever left it as
        // it was in the base did not decide anything about it.
        let (was, ours_run, theirs_run) =
            (&common[at..k], &mine[at_mine..x], &yours[at_yours..y]);
        if ours_run == was {
            out.extend_from_slice(theirs_run);
        } else if theirs_run == was || theirs_run == ours_run {
            out.extend_from_slice(ours_run);
        } else {
            disputed += ours_run.len().max(theirs_run.len());
        }

        match anchor {
            Some(_) => {
                out.push(common[k]);
                at = k + 1;
                at_mine = x + 1;
                at_yours = y + 1;
            }
            None => break,
        }
    }

    if disputed > 0 {
        return TextMerge::Clash { lines: disputed };
    }
    let mut text = out.join("\n");
    // The file's last byte is not a decision either: it is ours unless we are
    // taking the other version whole.
    if ours.ends_with('\n') && !text.is_empty() {
        text.push('\n');
    }
    TextMerge::Merged(text)
}

/// For each line of `base`, which line of `other` it is the same line as —
/// the longest common subsequence, so an insertion moves the lines after it
/// instead of making every one of them a change. `None` when the two are too
/// big to compare ([`MAX_CELLS`]).
fn line_map(base: &[&str], other: &[&str]) -> Option<Vec<Option<usize>>> {
    let mut map = vec![None; base.len()];
    // What both start and end with is the same line by inspection — and it is
    // what makes the table small enough to build for the usual edit.
    let head = base
        .iter()
        .zip(other)
        .take_while(|(a, b)| a == b)
        .count();
    let tail = base[head..]
        .iter()
        .rev()
        .zip(other[head..].iter().rev())
        .take_while(|(a, b)| a == b)
        .count();
    for (k, slot) in map.iter_mut().enumerate().take(head) {
        *slot = Some(k);
    }
    for k in 0..tail {
        map[base.len() - 1 - k] = Some(other.len() - 1 - k);
    }

    let (rows, columns) = (base.len() - head - tail, other.len() - head - tail);
    if rows == 0 || columns == 0 {
        return Some(map);
    }
    if rows.checked_mul(columns)? > MAX_CELLS {
        return None;
    }

    // Classic table: `table[i][j]` is the longest common subsequence of the
    // two tails, built from the end so the walk back reads forwards.
    let width = columns + 1;
    let mut table = vec![0u32; (rows + 1) * width];
    for i in (0..rows).rev() {
        for j in (0..columns).rev() {
            table[i * width + j] = if base[head + i] == other[head + j] {
                table[(i + 1) * width + j + 1] + 1
            } else {
                table[(i + 1) * width + j].max(table[i * width + j + 1])
            };
        }
    }
    let (mut i, mut j) = (0, 0);
    while i < rows && j < columns {
        if base[head + i] == other[head + j] {
            map[head + i] = Some(head + j);
            i += 1;
            j += 1;
        } else if table[(i + 1) * width + j] >= table[i * width + j + 1] {
            i += 1;
        } else {
            j += 1;
        }
    }
    Some(map)
}

/// How many lines of `after` were not in `before` — what a merge carried
/// over, for the notice that says so.
pub fn changed_lines(before: &str, after: &str) -> usize {
    let held: Vec<&str> = before.lines().collect();
    after.lines().filter(|line| !held.contains(line)).count()
}

/// How far apart two versions are when the merge will not even look: the
/// lines of one that the other does not hold at all.
fn apart(ours: &[&str], theirs: &[&str]) -> usize {
    theirs.iter().filter(|line| !ours.contains(line)).count()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn merged(base: &str, ours: &str, theirs: &str) -> String {
        match merge_text(base, ours, theirs) {
            TextMerge::Merged(text) => text,
            TextMerge::Clash { lines } => panic!("expected a clean merge, {lines} lines disputed"),
        }
    }

    #[test]
    fn each_device_writing_in_its_own_paragraph_merges() {
        let base = "# Ideia\n\nUm paragrafo.\n\nOutro paragrafo.\n";
        let ours = "# Ideia\n\nUm paragrafo, agora maior.\n\nOutro paragrafo.\n";
        let theirs = "# Ideia\n\nUm paragrafo.\n\nOutro paragrafo, tambem.\n";

        assert_eq!(
            merged(base, ours, theirs),
            "# Ideia\n\nUm paragrafo, agora maior.\n\nOutro paragrafo, tambem.\n"
        );
    }

    #[test]
    fn a_line_added_on_each_side_lands_where_it_was_written() {
        let base = "um\ndois\ntres\n";
        let ours = "um\num e meio\ndois\ntres\n";
        let theirs = "um\ndois\ntres\nquatro\n";

        assert_eq!(merged(base, ours, theirs), "um\num e meio\ndois\ntres\nquatro\n");
    }

    #[test]
    fn a_line_one_side_deleted_goes() {
        let base = "um\ndois\ntres\n";
        assert_eq!(merged(base, "um\ntres\n", base), "um\ntres\n");
        assert_eq!(merged(base, base, "um\ntres\n"), "um\ntres\n");
    }

    #[test]
    fn the_same_line_rewritten_on_both_sides_is_not_settled() {
        let base = "um\ndois\ntres\n";
        assert_eq!(
            merge_text(base, "um\nDOIS\ntres\n", "um\ndois!\ntres\n"),
            TextMerge::Clash { lines: 1 }
        );
    }

    #[test]
    fn the_same_edit_on_both_sides_is_no_dispute() {
        let base = "um\ndois\n";
        assert_eq!(merged(base, "um\nDOIS\n", "um\nDOIS\n"), "um\nDOIS\n");
    }

    #[test]
    fn the_frontmatter_and_the_banner_are_lines_like_any_other() {
        // A note carries its keys at the top and its banner in a comment; the
        // merge has no idea what they are, and does not need one.
        let base = "---\ntitle: Ideia\n---\n<!--banner: yellow-->\n\nTexto.\n";
        let ours = "---\ntitle: Ideia\ntags: [casa]\n---\n<!--banner: yellow-->\n\nTexto.\n";
        let theirs = "---\ntitle: Ideia\n---\n<!--banner: blue-->\n\nTexto.\n";

        let out = merged(base, ours, theirs);
        assert!(out.contains("tags: [casa]"), "{out}");
        assert!(out.contains("<!--banner: blue-->"), "{out}");
    }

    #[test]
    fn a_merge_of_the_same_pair_is_the_same_text_on_both_devices() {
        let base = "um\ndois\ntres\n";
        let ours = "um\nUM E MEIO\ndois\ntres\n";
        let theirs = "um\ndois\ntres\nquatro\n";
        assert_eq!(merged(base, ours, theirs), merged(base, ours, theirs));
    }

    #[test]
    fn the_last_byte_is_not_a_decision() {
        assert_eq!(merged("a\nb\n", "a\nb\nc\n", "a\nb\n"), "a\nb\nc\n");
        // No trailing newline in ours, none in the result.
        assert_eq!(merged("a\nb", "a\nb\nc", "a\nb"), "a\nb\nc");
    }

    #[test]
    fn nothing_in_common_is_still_a_dispute_and_not_a_guess() {
        assert_eq!(
            merge_text("base\n", "a minha\n", "a dela\n"),
            TextMerge::Clash { lines: 1 }
        );
    }

    #[test]
    fn one_side_untouched_is_the_other_side_whole() {
        let base = "um\ndois\n";
        assert_eq!(merged(base, base, "outro texto\n"), "outro texto\n");
        assert_eq!(merged(base, "outro texto\n", base), "outro texto\n");
    }

    #[test]
    fn a_text_too_long_to_compare_is_left_for_the_user() {
        // The cap is not a limit on notes, it is a limit on the TABLE: the
        // head and the tail both sides share never enter it.
        let long: String = (0..3000).map(|n| format!("linha {n}\n")).collect();
        let ours = format!("{long}minha\n");
        let theirs = format!("{long}dela\n");
        assert!(matches!(
            merge_text(&long, &ours, &theirs),
            TextMerge::Clash { .. }
        ));
    }
}
