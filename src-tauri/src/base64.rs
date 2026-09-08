//! Base64, only as far as the bridge needs it: the shape bytes take while
//! crossing the IPC (the core deals in `&[u8]`). Written out rather than
//! pulled from a crate: Tauri accepts raw bytes in a command on every
//! platform except Android (`tauri::ipc::Request`), so an image travels as
//! text, and the decoder is forty lines.

/// Decodes standard base64 (with or without `=` padding, whitespace ignored).
/// `None` for anything that is not base64: a silent half-decoded image would
/// be written to the user's notebook as a corrupt file.
pub fn decode(text: &str) -> Option<Vec<u8>> {
    let mut out = Vec::with_capacity(text.len() / 4 * 3);
    // Six bits at a time into a 24-bit window; every four symbols empty it.
    let mut window: u32 = 0;
    let mut bits = 0;

    for byte in text.bytes() {
        match byte {
            b'\n' | b'\r' | b' ' | b'\t' => continue,
            b'=' => break,
            _ => {}
        }
        let value = symbol(byte)?;
        window = (window << 6) | u32::from(value);
        bits += 6;
        if bits == 24 {
            out.extend_from_slice(&[
                (window >> 16) as u8,
                (window >> 8) as u8,
                window as u8,
            ]);
            window = 0;
            bits = 0;
        }
    }

    // The tail: 12 bits left mean one more byte, 18 mean two. Six bits left is
    // not a truncated byte, it is a broken string.
    match bits {
        0 => {}
        12 => out.push((window >> 4) as u8),
        18 => out.extend_from_slice(&[(window >> 10) as u8, (window >> 2) as u8]),
        _ => return None,
    }
    Some(out)
}

/// Standard base64, padded — the other direction, for handing the webview
/// bytes it can put in a `src` (`data:image/png;base64,…`).
pub fn encode(bytes: &[u8]) -> String {
    const ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        // The 24-bit window again, filled with whatever the chunk has; the
        // symbols the missing bytes would have produced become `=`.
        let mut window = 0u32;
        for (i, byte) in chunk.iter().enumerate() {
            window |= u32::from(*byte) << (16 - 8 * i);
        }
        for i in 0..4 {
            if i <= chunk.len() {
                out.push(ALPHABET[((window >> (18 - 6 * i)) & 0x3F) as usize] as char);
            } else {
                out.push('=');
            }
        }
    }
    out
}

/// The six bits a base64 symbol stands for. Accepts the URL-safe pair too
/// (`-_`): a webview that hands one over means the same bytes by it.
fn symbol(byte: u8) -> Option<u8> {
    Some(match byte {
        b'A'..=b'Z' => byte - b'A',
        b'a'..=b'z' => byte - b'a' + 26,
        b'0'..=b'9' => byte - b'0' + 52,
        b'+' | b'-' => 62,
        b'/' | b'_' => 63,
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_the_documented_examples() {
        // RFC 4648's own vectors, which is the only reason to trust a decoder
        // someone wrote by hand.
        for (encoded, plain) in [
            ("", ""),
            ("Zg==", "f"),
            ("Zm8=", "fo"),
            ("Zm9v", "foo"),
            ("Zm9vYg==", "foob"),
            ("Zm9vYmE=", "fooba"),
            ("Zm9vYmFy", "foobar"),
        ] {
            assert_eq!(decode(encoded).unwrap(), plain.as_bytes(), "{encoded}");
        }
    }

    #[test]
    fn decodes_without_padding_and_across_lines() {
        // A `FileReader` data URL has no line breaks; a file written by hand
        // does. Both are the same bytes.
        assert_eq!(decode("Zm9vYmE").unwrap(), b"fooba");
        assert_eq!(decode("Zm9v\nYmFy\n").unwrap(), b"foobar");
    }

    #[test]
    fn decodes_every_byte_value_round_trip() {
        // The PNG header, which is where a wrong high bit would show up first.
        let png = [0x89u8, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0xFF, 0x00];
        assert_eq!(decode("iVBORw0KGgr/AA==").unwrap(), png);
    }

    #[test]
    fn encodes_the_documented_examples() {
        // The same RFC 4648 vectors, read the other way.
        for (plain, encoded) in [
            ("", ""),
            ("f", "Zg=="),
            ("fo", "Zm8="),
            ("foo", "Zm9v"),
            ("foob", "Zm9vYg=="),
            ("fooba", "Zm9vYmE="),
            ("foobar", "Zm9vYmFy"),
        ] {
            assert_eq!(encode(plain.as_bytes()), encoded, "{plain}");
        }
    }

    #[test]
    fn what_is_encoded_decodes_back() {
        // Every byte value, which is where a wrong shift shows up.
        let all: Vec<u8> = (0..=255u8).collect();
        assert_eq!(decode(&encode(&all)).unwrap(), all);
    }

    #[test]
    fn refuses_what_is_not_base64() {
        // Refusing beats writing half an image into the user's notebook.
        assert!(decode("não é base64!").is_none());
        assert!(decode("Z").is_none(), "six leftover bits is a broken string");
        // ...while two symbols ARE a byte: that is unpadded base64, not a
        // truncated string.
        assert_eq!(decode("Zg").unwrap(), b"f");
    }
}
