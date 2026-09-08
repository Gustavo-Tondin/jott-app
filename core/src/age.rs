//! How old something is, and which band it falls in — one age, computed in
//! one place. `age = today − max(created, last seen)`, with the file's mtime
//! as a last resort ONLY when nothing was ever seen: a sync tool rewrites
//! mtime, and folding it into the maximum would make a synced notebook look
//! brand new. Only notes have a "seen"; a task passes `None` for both.

use chrono::{NaiveDate, NaiveDateTime};

/// The three names the app gives an age. Named, not numeric: the number is
/// a setting, the meaning is not.
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
    /// things pass through.
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

    /// Which band an age in days falls in. Crossed thresholds (a hand-edited
    /// `stale` below `fresh`) still give three reachable bands: fresh first.
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

/// The day something last counted as touched. `modified` (mtime) is used
/// ONLY when there is no `seen` — see the module doc.
fn touched_on(
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
fn age_days(
    today: NaiveDate,
    created: NaiveDate,
    seen: Option<NaiveDateTime>,
    modified: Option<NaiveDate>,
) -> i64 {
    (today - touched_on(created, seen, modified))
        .num_days()
        .max(0)
}

/// An age as a SCREEN reads it: days and band together, so no two screens
/// disagree. Derived on the way out of the notebook, never on the way in:
/// nothing in a file says how old it is.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
pub struct Age {
    pub days: i64,
    pub band: Band,
}

impl Age {
    /// The age of something born on `created`, last seen at `seen`, whose
    /// file was last written on `modified`, read against `thresholds`. A
    /// task passes `None` for both middle arguments.
    pub fn of(
        today: NaiveDate,
        created: NaiveDate,
        seen: Option<NaiveDateTime>,
        modified: Option<NaiveDate>,
        thresholds: Thresholds,
    ) -> Self {
        let days = age_days(today, created, seen, modified);
        Self {
            days,
            band: thresholds.band(days),
        }
    }
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
        // A sync tool rewrote every mtime today; the note was last open in
        // January.
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

    #[test]
    fn an_age_carries_its_own_band() {
        let age = Age::of(day(30), day(20), None, None, Thresholds::default());
        assert_eq!(age.days, 10);
        assert_eq!(age.band, Band::Stale);
    }

    #[test]
    fn the_inbox_thresholds_travel_with_the_age() {
        // The same ten days, read against the Inbox's shorter deadline.
        let age = Age::of(day(30), day(20), None, None, Thresholds::default().in_inbox());
        assert_eq!(age.days, 10);
        assert_eq!(age.band, Band::Forgotten);
    }
}
