//! Minimal HTTP client for the local backend.
//!
//! Uses raw TCP sockets so the desktop shell has no
//! dependency on reqwest or other HTTP crates. Only
//! talks to ``127.0.0.1:8765``.

use std::io::{Read, Write};
use std::net::TcpStream;
use std::time::Duration;

use crate::BACKEND_ADDR;

/// Check whether the backend port is accepting
/// connections.
pub fn is_port_open() -> bool {
    TcpStream::connect_timeout(
        &BACKEND_ADDR.parse().unwrap(),
        Duration::from_millis(200),
    )
    .is_ok()
}

/// HTTP GET to the local backend.
pub fn get(path: &str) -> Result<String, String> {
    let mut s = TcpStream::connect(BACKEND_ADDR)
        .map_err(|e| format!("{e}"))?;
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
    let mut s = TcpStream::connect(BACKEND_ADDR)
        .map_err(|e| format!("{e}"))?;
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
