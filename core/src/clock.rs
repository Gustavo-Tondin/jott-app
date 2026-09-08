//! The day, by the system clock.
//!
//! The turn of the day was a user preference until 2026-09-04 — an offset
//! from midnight, for the planner who sets up tomorrow before bed or the
//! night owl. The Home's calendar plans the next day on its own page, so the
//! day is the calendar's now: it turns at local midnight, and the offset
//! went with the setting.
//!
//! Hard rule: this module is the ONLY place in the core allowed to read the
//! system clock. `Local::now()` has one home, so that "which day is it" is
//! answered the same way everywhere — and so that a test can pin the
//! instant (the `_at` variants) instead of depending on when it runs.

use chrono::{DateTime, Duration, Local, NaiveDate, NaiveDateTime, TimeZone};

/// Which weekday opens the week — what the Home's calendar strip starts on.
/// A display preference since the week stopped being a period (2026-09-04);
/// it lives here because the config and the settings both spell it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum WeekStart {
    #[default]
    Monday,
    Sunday,
}

impl WeekStart {
    pub fn parse_or_default(text: &str) -> Self {
        match text.trim().to_ascii_lowercase().as_str() {
            "sunday" | "domingo" => Self::Sunday,
            _ => Self::Monday,
        }
    }

    pub fn render(self) -> &'static str {
        match self {
            Self::Monday => "monday",
            Self::Sunday => "sunday",
        }
    }

}

/// Today's date, by the system clock — the notebook's day and the stamp a
/// trash item or a completion gets, one and the same since 2026-09-04.
pub fn civil_today() -> NaiveDate {
    Local::now().date_naive()
}

/// The wall clock as a local date AND time — the stamp the "last seen" index
/// writes (`crate::seen`). Beside [`civil_today`] for the same reason:
/// `Local::now()` has one home, and the invariant test says so.
pub fn civil_now() -> NaiveDateTime {
    Local::now().naive_local()
}

/// The local calendar day an instant fell on — a file's mtime, mostly.
///
/// Here rather than at the call site for the same reason as everything else
/// in this module: turning an instant into a DAY is a calendar decision, and
/// the app makes those in one place.
pub fn civil_date_of(time: std::time::SystemTime) -> NaiveDate {
    DateTime::<Local>::from(time).date_naive()
}

/// When the next day turns — the coming midnight — from the system clock.
///
/// The `_at` variant takes the instant for the tests; this one exists so no
/// caller outside this module ever needs `Local::now()` — which is the whole
/// invariant (see `core/tests/invariants.rs`).
pub fn next_daily_turn() -> DateTime<Local> {
    next_daily_turn_at(Local::now())
}

/// The midnight after `now`, so a running app can schedule a timer instead
/// of only rolling over when the notebook is opened.
fn next_daily_turn_at(now: DateTime<Local>) -> DateTime<Local> {
    let next_day = now.date_naive() + Duration::days(1);
    to_local(
        next_day
            .and_hms_opt(0, 0, 0)
            .expect("midnight is always a valid time"),
    )
}

/// Resolves a local wall clock time to an instant.
///
/// DST makes this partial: on a spring-forward night the instant may not
/// exist at all, and on a fall-back night it happens twice. Taking the
/// earliest match, and stepping forward until the clock exists, keeps the
/// rollover firing once on those two nights a year instead of never.
fn to_local(naive: NaiveDateTime) -> DateTime<Local> {
    for extra_minutes in 0..=120 {
        let candidate = naive + Duration::minutes(extra_minutes);
        if let Some(resolved) = Local.from_local_datetime(&candidate).earliest() {
            return resolved;
        }
    }
    Local::now()
}

/// The wall clock as an INSTANT, for comparing against a file's mtime
/// (`history::Stamp::is_racy`, 2026-08-24). Not a date: no calendar decision
/// can be taken from it, which is why it lives here beside the logical day
/// rather than being one more `SystemTime::now()` the invariant test would
/// have to forbid.
pub fn system_now() -> std::time::SystemTime {
    std::time::SystemTime::now()
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::NaiveTime;

    /// Builds a local instant for a test, skipping any DST hole.
    fn at(date: (i32, u32, u32), time: (u32, u32)) -> DateTime<Local> {
        let naive = NaiveDate::from_ymd_opt(date.0, date.1, date.2)
            .unwrap()
            .and_time(NaiveTime::from_hms_opt(time.0, time.1, 0).unwrap());
        to_local(naive)
    }

    fn ymd(y: i32, m: u32, d: u32) -> NaiveDate {
        NaiveDate::from_ymd_opt(y, m, d).unwrap()
    }

    #[test]
    fn parses_week_start_tolerantly() {
        assert_eq!(WeekStart::parse_or_default("sunday"), WeekStart::Sunday);
        assert_eq!(WeekStart::parse_or_default("SUNDAY"), WeekStart::Sunday);
        assert_eq!(WeekStart::parse_or_default("monday"), WeekStart::Monday);
        assert_eq!(WeekStart::parse_or_default("banana"), WeekStart::Monday);
    }

    #[test]
    fn next_daily_turn_is_the_coming_midnight() {
        let now = at((2026, 7, 20), (10, 0));
        let next = next_daily_turn_at(now);

        assert!(next > now);
        assert_eq!(next.date_naive(), ymd(2026, 7, 21));
        assert_eq!(next.naive_local().time(), NaiveTime::from_hms_opt(0, 0, 0).unwrap());
        // Ten to midnight still turns at THIS midnight, not the one after.
        let late = at((2026, 7, 20), (23, 50));
        assert_eq!(next_daily_turn_at(late).date_naive(), ymd(2026, 7, 21));
    }
}
