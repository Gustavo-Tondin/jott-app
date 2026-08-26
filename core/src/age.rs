//! How old something is, and which of the three bands it falls in.
//!
//! **One age, computed in one place** (spec 3.6). Every screen that wants to
//! say "this has been sitting here a while" — the sweep, the sort by age, the
//! stamp on a card — asks this module, so they can never disagree about what
//! old means.
//!
//! The rule, and the one subtlety in it:
//!
//! ```text
//! age = today − the most recent of (created, last seen)
//! ```
//!
//! …with the file's **mtime as a last resort only**, when nothing has ever
//! been seen. That "only" is the subtlety, and it is the whole reason this is
//! not a one-liner at the call site: a sync tool rewrites mtime on files
//! nobody has opened in a year, so folding mtime into the maximum would make
//! a synced notebook look brand new — exactly the case the feature exists
//! for. `created` is the floor either way: nothing is older than its own
//! birth.
//!
//! **Notes only have a "seen"** (user call, 2026-08-26). A task shows the age
//! of its creation date and nothing else, which is simply this function with
//! `seen` and `modified` left empty.

use chrono::{NaiveDate, NaiveDateTime};

/// The three names the app gives an age.
///
/// Named rather than numeric because the *number* is a setting and the
/// *meaning* is not: a person who moves the threshold to 90 days still has
/// fresh, stale and forgotten things.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Band {
    /// Recent enough to still be in mind.
    Fresh,
    /// Sitting there.
    Stale,
    /// Old enough that the weekly sweep will ask about it.
    Forgotten,
}

/// Where the bands begin, in days. Lives in `.jott/config.json` (`age`),
/// because it answers to a *person*, not to a machine.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Thresholds {
    /// Below this, fresh.
    pub fresh: i64,
    /// Below this, stale; at or above it, forgotten.
    pub stale: i64,
    /// The Inbox's own "stale", shorter by default: an inbox is a place
    /// things pass through, so a week there means something different from a
    /// week in a space someone built on purpose (spec 3.6).
    pub inbox_stale: i64,
}

impl Default for Thresholds {
    fn default() -> Self {
        Self {
            fresh: 7,
            stale: 30,
            inbox_stale: 7,
        }
    }
}

impl Thresholds {
    /// The same thresholds with the Inbox's shorter "stale" in place of the
    /// general one — what a screen showing the inbox reads.
    pub fn in_inbox(self) -> Self {
        Self {
            fresh: self.fresh.min(self.inbox_stale),
            stale: self.inbox_stale,
            ..self
        }
    }

    /// Which band an age in days falls in.
    ///
    /// Thresholds that cross over (a `stale` below `fresh`, which a
    /// hand-edited config can carry) are read in the only order that keeps
    /// three bands: fresh wins first, so the file never produces a band that
    /// cannot be reached.
    pub fn band(self, days: i64) -> Band {
        if days < self.fresh {
            Band::Fresh
        } else if days < self.stale {
            Band::Stale
        } else {
            Band::Forgotten
        }
    }
}

/// The day something last counted as touched.
///
/// `seen` is when a person had it open; `modified` is the file's mtime, used
/// **only** when there is no `seen` — see the module doc for why that
/// asymmetry is the point.
pub fn touched_on(
    created: NaiveDate,
    seen: Option<NaiveDateTime>,
    modified: Option<NaiveDate>,
) -> NaiveDate {
    let last = match seen {
        Some(seen) => seen.date(),
        None => modified.unwrap_or(created),
    };
    last.max(created)
}

/// How many days old something is. Never negative: a creation date in the
/// future (a hand-written file, a clock that jumped) reads as brand new
/// rather than as a number that would sort above everything.
pub fn age_days(
    today: NaiveDate,
    created: NaiveDate,
    seen: Option<NaiveDateTime>,
    modified: Option<NaiveDate>,
) -> i64 {
    (today - touched_on(created, seen, modified))
        .num_days()
        .max(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn day(d: u32) -> NaiveDate {
        NaiveDate::from_ymd_opt(2026, 8, d).unwrap()
    }

    fn seen_on(d: u32) -> Option<NaiveDateTime> {
        Some(day(d).and_hms_opt(9, 0, 0).unwrap())
    }

    #[test]
    fn something_never_opened_is_as_old_as_it_is() {
        assert_eq!(age_days(day(30), day(20), None, None), 10);
    }

    #[test]
    fn opening_it_makes_it_young_again() {
        assert_eq!(age_days(day(30), day(1), seen_on(28), None), 2);
    }

    #[test]
    fn sync_does_not_rejuvenate_what_nobody_opened() {
        // The case the whole asymmetry exists for: a sync tool rewrote every
        // mtime today, and the note has been open once, back in January.
        let born = NaiveDate::from_ymd_opt(2026, 1, 1).unwrap();
        let january = NaiveDate::from_ymd_opt(2026, 1, 5)
            .unwrap()
            .and_hms_opt(9, 0, 0)
            .unwrap();
        let age = age_days(day(30), born, Some(january), Some(day(30)));
        assert!(age > 200, "an untouched note stayed old: {age}");
    }

    #[test]
    fn the_mtime_is_used_when_there_is_nothing_better() {
        // No "seen" at all — a task, or a note this build never opened. The
        // file's own date is a poor signal, and better than none.
        assert_eq!(age_days(day(30), day(1), None, Some(day(25))), 5);
    }

    #[test]
    fn nothing_is_older_than_its_own_birth() {
        // An mtime older than the creation date (a copy, a restore from a
        // backup) must not make something older than it is.
        assert_eq!(age_days(day(30), day(20), None, Some(day(1))), 10);
    }

    #[test]
    fn a_date_in_the_future_reads_as_brand_new() {
        assert_eq!(age_days(day(20), day(30), None, None), 0);
    }

    #[test]
    fn the_three_bands_are_where_the_spec_says() {
        let thresholds = Thresholds::default();
        assert_eq!(thresholds.band(0), Band::Fresh);
        assert_eq!(thresholds.band(6), Band::Fresh);
        assert_eq!(thresholds.band(7), Band::Stale);
        assert_eq!(thresholds.band(29), Band::Stale);
        assert_eq!(thresholds.band(30), Band::Forgotten);
        assert_eq!(thresholds.band(365), Band::Forgotten);
    }

    #[test]
    fn the_inbox_goes_stale_sooner() {
        let inbox = Thresholds::default().in_inbox();
        assert_eq!(inbox.band(6), Band::Fresh);
        // What would still be "stale" anywhere else is forgotten in an inbox.
        assert_eq!(inbox.band(7), Band::Forgotten);
    }

    #[test]
    fn crossed_thresholds_still_produce_three_bands() {
        // A hand-edited config can say anything; what it must not do is
        // produce a band nobody can be in.
        let odd = Thresholds {
            fresh: 30,
            stale: 7,
            inbox_stale: 7,
        };
        assert_eq!(odd.band(10), Band::Fresh);
        assert_eq!(odd.band(40), Band::Forgotten);
    }
}
