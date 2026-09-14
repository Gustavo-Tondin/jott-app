//! Stable short ids for tasks.
//!
//! Ids only need to be unique inside a notebook and stable once written, so a
//! short base36 string is enough — it keeps the markdown readable, which is a
//! product requirement, not an implementation detail.

use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::OnceLock;
use std::time::{SystemTime, UNIX_EPOCH};

const ID_LEN: usize = 6;
const ALPHABET: &[u8] = b"0123456789abcdefghijklmnopqrstuvwxyz";

/// Every value `ID_LEN` base36 characters can spell: 36^6 = 2^12 * 3^12.
const SPACE: u64 = 2_176_782_336;
/// Odd and not a multiple of three, so it shares no factor with `SPACE` and
/// multiplying by it modulo `SPACE` is a bijection: the step from one id to
/// the next lands far away, and no two steps of a run land on each other.
const STRIDE: u64 = 1_345_251_485;

static COUNTER: AtomicU64 = AtomicU64::new(0);
static ORIGIN: OnceLock<u64> = OnceLock::new();

/// Where this run starts counting. The clock is read once, so the ids of two
/// runs are unrelated while the ids of one run stay a walk with no repeats.
fn origin() -> u64 {
    *ORIGIN.get_or_init(|| {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_or(0, |d| d.as_nanos() as u64);
        let mut hasher = DefaultHasher::new();
        nanos.hash(&mut hasher);
        hasher.finish() % SPACE
    })
}

/// Generates a new id. Not cryptographically random: the counter keeps ids
/// distinct within a run — every one of the `SPACE` values comes up before
/// any comes up twice — and the clock keeps them distinct across runs.
pub fn generate() -> String {
    let seq = COUNTER.fetch_add(1, Ordering::Relaxed) % SPACE;
    spell((origin() + seq * STRIDE) % SPACE)
}

/// Generates an id that does not collide with `taken`.
pub fn generate_unique(taken: &std::collections::HashSet<String>) -> String {
    loop {
        let candidate = generate();
        if !taken.contains(&candidate) {
            return candidate;
        }
    }
}

/// An id DERIVED from `seed`, free of `taken` — for the ids a merge has to
/// invent. Two devices merging the same pair must land on the same bytes, and
/// a random id would have them handing each other a conflict for ever, so the
/// seed (the content the id is for) is all this reads.
///
/// The hash is spelled out here, and stays spelled out: `DefaultHasher` is
/// only promised to be stable within one build of the standard library, and
/// two devices are two builds.
pub fn derived(seed: &str, taken: &std::collections::HashSet<String>) -> String {
    for attempt in 0..u32::MAX {
        let candidate = spell(digest(&format!("{seed}#{attempt}")) % SPACE);
        if !taken.contains(&candidate) {
            return candidate;
        }
    }
    generate_unique(taken)
}

/// FNV-1a, 64 bits: small, and the same number on every machine for ever.
fn digest(text: &str) -> u64 {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in text.as_bytes() {
        hash ^= *byte as u64;
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    hash
}

/// A number as the `ID_LEN` base36 characters that spell it.
fn spell(mut value: u64) -> String {
    let mut id = String::with_capacity(ID_LEN);
    for _ in 0..ID_LEN {
        id.push(ALPHABET[(value % ALPHABET.len() as u64) as usize] as char);
        value /= ALPHABET.len() as u64;
    }
    id
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn ids_have_the_expected_shape() {
        let id = generate();
        assert_eq!(id.len(), ID_LEN);
        assert!(id.chars().all(|c| c.is_ascii_alphanumeric() && !c.is_ascii_uppercase()));
    }

    #[test]
    fn ids_do_not_repeat_in_bulk() {
        let ids: HashSet<String> = (0..10_000).map(|_| generate()).collect();
        assert_eq!(ids.len(), 10_000, "generated ids collided");
    }

    #[test]
    fn the_stride_visits_every_id_before_repeating_one() {
        // What makes the bulk test a guarantee rather than a coin toss:
        // sharing no factor with SPACE is what stops the walk cycling early.
        assert_eq!(SPACE, (ALPHABET.len() as u64).pow(ID_LEN as u32));
        assert_eq!(STRIDE % 2, 1);
        assert_ne!(STRIDE % 3, 0);
    }

    #[test]
    fn consecutive_ids_do_not_read_as_a_sequence() {
        let (first, second) = (generate(), generate());
        let same: usize = first
            .chars()
            .zip(second.chars())
            .filter(|(a, b)| a == b)
            .count();
        assert!(same < ID_LEN - 1, "{first} and {second} look consecutive");
    }

    #[test]
    fn a_derived_id_is_the_same_number_on_every_machine() {
        // What keeps two devices from handing each other a conflict for ever.
        // The value is pinned on purpose: a change of hash here is a change
        // of behaviour between app versions, not a refactor.
        let free = HashSet::new();
        assert_eq!(derived("k9kdki:Comprar pao", &free), derived("k9kdki:Comprar pao", &free));
        assert_ne!(derived("k9kdki:Comprar pao", &free), derived("k9kdki:Comprar cha", &free));
        assert_eq!(derived("k9kdki:Comprar pao", &free), "bbcqk0");
    }

    #[test]
    fn a_derived_id_steps_aside_from_what_is_taken() {
        let mut taken = HashSet::new();
        let first = derived("semente", &taken);
        taken.insert(first.clone());
        let second = derived("semente", &taken);
        assert_ne!(second, first);
        // And the step aside is itself the same on both devices.
        assert_eq!(second, derived("semente", &taken));
    }

    #[test]
    fn generate_unique_avoids_taken_ids() {
        let mut taken = HashSet::new();
        let first = generate();
        taken.insert(first.clone());
        assert_ne!(generate_unique(&taken), first);
    }
}
