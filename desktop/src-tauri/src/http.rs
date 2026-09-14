//! Minimal HTTP client for the local backend.
//!
//! Uses raw TCP sockets so the desktop shell has no
//! dependency on reqwest or other HTTP crates. Only
//! talks to ``127.0.0.1:8765`` (8767 in debug builds).

use std::io::{Read, Write};
use std::net::TcpStream;
use std::time::Duration;

use crate::BACKEND_ADDR;

/// How long to wait on a connect, a write, or a read.
///
/// Every one of these is needed. Without a read timeout a
/// backend that accepts the connection and then never
/// answers blocks the caller forever, and the caller that
/// matters is the tray ticker: it runs on a Tokio worker,
/// so a hung read pins that worker and the menu-bar pill
/// stops updating until the app is restarted. The ticker
/// is already wrapped in catch_unwind against exactly that
/// outcome from a panic; a hang got there by the other
/// door.
///
/// Five seconds is generous for a local FastAPI answering
/// /api/clocks/active and short enough that a stuck one
/// costs a single tick.
const IO_TIMEOUT: Duration = Duration::from_secs(5);

/// Connect to ``addr`` with every timeout applied.
///
/// Takes the address rather than reading BACKEND_ADDR so a
/// test can point the real function at a stub listener.
/// Every caller passes BACKEND_ADDR.
fn connect_to(addr: &str) -> Result<TcpStream, String> {
    let parsed = addr.parse().map_err(|e| format!("{e}"))?;
    let s = TcpStream::connect_timeout(&parsed, IO_TIMEOUT)
        .map_err(|e| format!("{e}"))?;
    s.set_read_timeout(Some(IO_TIMEOUT))
        .map_err(|e| format!("{e}"))?;
    s.set_write_timeout(Some(IO_TIMEOUT))
        .map_err(|e| format!("{e}"))?;
    Ok(s)
}

fn connect() -> Result<TcpStream, String> {
    connect_to(BACKEND_ADDR)
}

/// Check whether the backend port is accepting
/// connections.
pub fn is_port_open() -> bool {
    TcpStream::connect_timeout(
        &BACKEND_ADDR.parse().expect("invalid BACKEND_ADDR"),
        Duration::from_millis(200),
    )
    .is_ok()
}

/// HTTP GET to the local backend.
pub fn get(path: &str) -> Result<String, String> {
    let mut s = connect()?;
    let req = format!(
        "GET {path} HTTP/1.1\r\n\
         Host: 127.0.0.1\r\n\
         Connection: close\r\n\r\n",
    );
    s.write_all(req.as_bytes())
        .map_err(|e| format!("{e}"))?;
    read_body(&mut s)
}

/// HTTP POST JSON to the local backend.
pub fn post(
    path: &str, body: &str,
) -> Result<String, String> {
    let mut s = connect()?;
    let req = format!(
        "POST {path} HTTP/1.1\r\n\
         Host: 127.0.0.1\r\n\
         Content-Type: application/json\r\n\
         Content-Length: {}\r\n\
         Connection: close\r\n\r\n{body}",
        body.len(),
    );
    s.write_all(req.as_bytes())
        .map_err(|e| format!("{e}"))?;
    read_body(&mut s)
}

/// Read the full response and strip HTTP headers.
fn read_body(
    s: &mut TcpStream,
) -> Result<String, String> {
    let mut buf = String::new();
    s.read_to_string(&mut buf)
        .map_err(|e| format!("{e}"))?;
    match buf.find("\r\n\r\n") {
        Some(i) => Ok(buf[i + 4..].to_string()),
        None => Ok(buf),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read as _;
    use std::net::TcpListener;
    use std::time::Instant;

    /// A listener that accepts and then says nothing,
    /// which is what a wedged backend looks like from
    /// here: the connect succeeds, the write succeeds,
    /// and the read never finishes.
    fn silent_listener() -> (TcpListener, String) {
        let l = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = l.local_addr().unwrap().to_string();
        (l, addr)
    }

    /// Goes through connect_to, so removing a timeout
    /// there breaks these rather than leaving them green.
    fn request(addr: &str) -> Result<String, String> {
        let mut s = connect_to(addr)?;
        s.write_all(b"GET / HTTP/1.1\r\n\r\n")
            .map_err(|e| format!("{e}"))?;
        read_body(&mut s)
    }

    #[test]
    fn a_silent_backend_does_not_block_forever() {
        let (listener, addr) = silent_listener();
        let accepted = std::thread::spawn(move || {
            // Hold the connection open without replying.
            if let Ok((mut sock, _)) = listener.accept() {
                let mut sink = [0u8; 64];
                let _ = sock.read(&mut sink);
                std::thread::sleep(
                    Duration::from_secs(30),
                );
            }
        });

        let started = Instant::now();
        let result = request(&addr);
        let waited = started.elapsed();

        assert!(
            result.is_err(),
            "a silent backend should time out, got {result:?}",
        );
        assert!(
            waited < IO_TIMEOUT + Duration::from_secs(2),
            "waited {waited:?}, expected about {IO_TIMEOUT:?}",
        );
        drop(accepted);
    }

    #[test]
    fn a_normal_response_is_parsed() {
        let (listener, addr) = silent_listener();
        std::thread::spawn(move || {
            if let Ok((mut sock, _)) = listener.accept() {
                let mut sink = [0u8; 256];
                let _ = sock.read(&mut sink);
                let _ = sock.write_all(
                    b"HTTP/1.1 200 OK\r\n\r\n{\"ok\":true}",
                );
            }
        });
        let body = request(&addr).unwrap();
        assert_eq!(body, "{\"ok\":true}");
    }
}
