"""Standardized HTTP error helpers for API routers.

Usage in routers:
    from ..errors import not_found, bad_request

    if item is None:
        raise not_found("Clock entry")
"""
from fastapi import HTTPException


def not_found(what: str = "Resource") -> HTTPException:
    """Return a 404 HTTPException."""
    return HTTPException(
        status_code=404, detail=f"{what} not found",
    )


def bad_request(detail: str) -> HTTPException:
    """Return a 400 HTTPException."""
    return HTTPException(
        status_code=400, detail=detail,
    )
