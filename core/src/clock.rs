//! The logical day.
//!
//! The turn of the day WAS a user preference until 2026-09-04 — an offset
//! from midnight, for the planner who sets up tomorrow before bed or the
//! night owl. The Home's calendar plans the next day on its own page, so the
//! day is the calendar's now and every caller passes `TurnOffset::MIDNIGHT`.
//! The offset machinery stays, tested, because the shape of "which day is
//! it" belongs here whatever the offset is.
//!
//! Hard rule: this module is the ONLY place in the core allowed to read the
//! system clock. Calling `Local::now().date_naive()` anywhere else silently
//! ignores the configured turn, and the bug only shows up in the hours around
//! midnight — exactly when nobody is testing.

use chrono::{DateTime, Duration, Local, NaiveDate, NaiveDateTime, TimeZone};

/// Offset of the period turn from midnight, in minutes.
///
/// `+120` is 02:00 (the previous day only ends at 2am), `-120` is 22:00 of
/// the evening before.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct TurnOffset(i32);

/// Largest offset that still keeps the turn inside a single day either way.
const MAX_OFFSET_MINUTES: i32 = 23 * 60 + 59;

impl TurnOffset {
    pub const MIDNIGHT: Self = Self(0);

    fn minutes(self) -> i32 {
        self.0
    }

    /// Builds an offset, clamping to ±23:59 so a nonsense config can never
    /// push the turn into another day and stall the rollover.
    pub fn from_minutes(minutes: i32) -> Self {
        Self(minutes.clamp(-MAX_OFFSET_MINUTES, MAX_OFFSET_MINUTES))
    }

    /// Parses `"HH:MM"`, `"+HH:MM"` or `"-HH:MM"`. Returns `None` when the
    /// string is not a valid offset — callers fall back to the default rather
    /// than failing to open the notebook.
    pub fn parse(text: &str) -> Option<Self> {
        let text = text.trim();
        let (sign, digits) = match text.strip_prefix('-') {
            Some(rest) => (-1, rest),
            None => (1, text.strip_prefix('+').unwrap_or(text)),
        };

        let (hours, minutes) = digits.split_once(':')?;
        let hours: i32 = hours.parse().ok()?;
        let minutes: i32 = minutes.parse().ok()?;
        if !(0..=59).contains(&minutes) || hours < 0 {
            return None;
        }

        let total = hours.checked_mul(60)?.checked_add(minutes)?;
        if total > MAX_OFFSET_MINUTES {
            return None;
        }
        Some(Self(sign * total))
    }

    /// Parses, falling back to midnight. Spec 3.3: a missing, malformed or
    /// unknown value takes the default without an error and without blocking
    /// the notebook from opening.
    pub fn parse_or_default(text: &str) -> Self {
        Self::parse(text).unwrap_or_default()
    }

    /// Renders back to the `"HH:MM"` / `"-HH:MM"` form used in the config.
    pub fn render(self) -> String {
        let sign = if self.0 < 0 { "-" } else { "" };
        let total = self.0.abs();
        format!("{sign}{:02}:{:02}", total / 60, total % 60)
    }
}

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

/// The logical day containing `now`.
///
/// Pure on purpose: the tests pin an instant instead of depending on when the
/// suite happens to run.
pub fn logical_date_at(now: DateTime<Local>, offset: TurnOffset) -> NaiveDate {
    shift(now.naive_local(), offset).date()
}

/// Today's logical date, by the system clock.
pub fn today(offset: TurnOffset) -> NaiveDate {
    logical_date_at(Local::now(), offset)
}

/// Today's civil date (no rollover offset), by the system clock. Used for
/// wall-clock stamps like a trash item's deletion date, where the notebook's
/// day/week offset is irrelevant.
pub fn civil_today() -> NaiveDate {
    Local::now().date_naive()
}

/// The wall clock as a local date AND time, no rollover offset — the stamp
/// the "last seen" index writes (`crate::seen`). Beside [`civil_today`] for
/// the same reason: `Local::now()` has one home, and the invariant test says
/// so.
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

/// When the next daily turn happens, from the system clock.
///
/// The `_at` variant takes the instant for the tests; this one exists so no
/// caller outside this module ever needs `Local::now()` — which is the whole
/// invariant (see `core/tests/invariants.rs`).
pub fn next_daily_turn(offset: TurnOffset) -> DateTime<Local> {
    next_daily_turn_at(Local::now(), offset)
}

/// When the next daily turn happens, so a running app can schedule a timer
/// instead of only rolling over when the notebook is opened.
pub fn next_daily_turn_at(now: DateTime<Local>, offset: TurnOffset) -> DateTime<Local> {
    let next_day = logical_date_at(now, offset) + Duration::days(1);
    to_local(unshift(next_day, offset))
}

/// Wall clock → logical timeline.
fn shift(naive: NaiveDateTime, offset: TurnOffset) -> NaiveDateTime {
    naive - Duration::minutes(offset.minutes() as i64)
}

/// Logical date → the wall clock instant that opens it.
fn unshift(date: NaiveDate, offset: TurnOffset) -> NaiveDateTime {
    date.and_hms_opt(0, 0, 0)
        .expect("midnight is always a valid time")
        + Duration::minutes(offset.minutes() as i64)
}

/// Resolves a local wall clock time to an instant.
///
/// DST makes this partial: on a spring-forward night the configured turn may
/// not exist at all, and on a fall-back night it happens twice. Taking the
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
    fn midnight_offset_matches_the_civil_date() {
        let now = at((2026, 7, 20), (13, 0));
        assert_eq!(logical_date_at(now, TurnOffset::MIDNIGHT), ymd(2026, 7, 20));
    }

    #[test]
    fn positive_offset_keeps_the_previous_day_until_the_turn() {
        // at = 02:00 — someone who works late. 01:00 still belongs to the 19th.
        let offset = TurnOffset::from_minutes(120);
        assert_eq!(
            logical_date_at(at((2026, 7, 20), (1, 0)), offset),
            ymd(2026, 7, 19)
        );
        assert_eq!(
            logical_date_at(at((2026, 7, 20), (2, 0)), offset),
            ymd(2026, 7, 20)
        );
    }

    #[test]
    fn negative_offset_starts_the_day_the_evening_before() {
        // at = -02:00, i.e. 22:00 — someone who plans tomorrow before bed.
        let offset = TurnOffset::from_minutes(-120);
        assert_eq!(
            logical_date_at(at((2026, 7, 19), (21, 59)), offset),
            ymd(2026, 7, 19)
        );
        assert_eq!(
            logical_date_at(at((2026, 7, 19), (22, 0)), offset),
            ymd(2026, 7, 20)
        );
    }

    #[test]
    fn parses_the_documented_offsets() {
        assert_eq!(TurnOffset::parse("00:00"), Some(TurnOffset::MIDNIGHT));
        assert_eq!(
            TurnOffset::parse("02:00"),
            Some(TurnOffset::from_minutes(120))
        );
        assert_eq!(
            TurnOffset::parse("-02:00"),
            Some(TurnOffset::from_minutes(-120))
        );
        assert_eq!(
            TurnOffset::parse("+01:30"),
            Some(TurnOffset::from_minutes(90))
        );
    }

    #[test]
    fn malformed_offset_falls_back_to_midnight() {
        // Spec 3.3: never fail to open the notebook over a bad preference.
        for bad in ["", "banana", "25:00", "01:70", "1", "01:00:00", "--01:00"] {
            assert_eq!(TurnOffset::parse(bad), None, "{bad:?} should not parse");
            assert_eq!(TurnOffset::parse_or_default(bad), TurnOffset::MIDNIGHT);
        }
    }

    #[test]
    fn offset_round_trips_through_the_config_format() {
        for text in ["00:00", "02:00", "-02:00", "23:59", "-23:59"] {
            assert_eq!(TurnOffset::parse(text).unwrap().render(), text);
        }
    }

    #[test]
    fn parses_week_start_tolerantly() {
        assert_eq!(WeekStart::parse_or_default("sunday"), WeekStart::Sunday);
        assert_eq!(WeekStart::parse_or_default("SUNDAY"), WeekStart::Sunday);
        assert_eq!(WeekStart::parse_or_default("monday"), WeekStart::Monday);
        assert_eq!(WeekStart::parse_or_default("banana"), WeekStart::Monday);
    }

    #[test]
    fn next_daily_turn_is_in_the_future_and_opens_the_next_day() {
        let offset = TurnOffset::from_minutes(-120);
        let now = at((2026, 7, 20), (10, 0));
        let next = next_daily_turn_at(now, offset);

        assert!(next > now);
        // The instant that opens the next logical day belongs to it already.
        assert_eq!(
            logical_date_at(next, offset),
            logical_date_at(now, offset) + Duration::days(1)
        );
    }

    #[test]
    fn extreme_offsets_are_clamped_instead_of_wrapping() {
        assert_eq!(
            TurnOffset::from_minutes(10_000).minutes(),
            MAX_OFFSET_MINUTES
        );
        assert_eq!(
            TurnOffset::from_minutes(-10_000).minutes(),
            -MAX_OFFSET_MINUTES
        );
    }
}
