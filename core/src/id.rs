//! Stable short ids for tasks.
//!
//! Ids only need to be unique inside a notebook and stable once written, so a
//! short base36 string is enough — it keeps the markdown readable, which is a
//! product requirement, not an implementation detail.

use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

const ID_LEN: usize = 6;
const ALPHABET: &[u8] = b"0123456789abcdefghijklmnopqrstuvwxyz";

static COUNTER: AtomicU64 = AtomicU64::new(0);

/// Generates a new id. Not cryptographically random: the counter keeps ids
/// distinct within a run, the clock keeps them distinct across runs.
pub fn generate() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos() as u64)
        .unwrap_or(0);
    let seq = COUNTER.fetch_add(1, Ordering::Relaxed);

    let mut hasher = DefaultHasher::new();
    nanos.hash(&mut hasher);
    seq.hash(&mut hasher);
    let mut value = hasher.finish();

    let mut id = String::with_capacity(ID_LEN);
    for _ in 0..ID_LEN {
        id.push(ALPHABET[(value % ALPHABET.len() as u64) as usize] as char);
        value /= ALPHABET.len() as u64;
    }
    id
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
    fn generate_unique_avoids_taken_ids() {
        let mut taken = HashSet::new();
        let first = generate();
        taken.insert(first.clone());
        assert_ne!(generate_unique(&taken), first);
    }
}
