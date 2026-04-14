use async_graphql::ErrorExtensions;

#[derive(thiserror::Error, Debug)]
pub enum AppError {
    #[error("Database error: {0}")]
    Database(#[from] mongodb::error::Error),

    #[error("Spotify network error: {0}")]
    Http(#[from] reqwest::Error),

    #[error("Spotify authentication failed: {0}")]
    SpotifyAuth(String),

    #[error("JWT error: {0}")]
    Jwt(#[from] jsonwebtoken::errors::Error),

    #[error("Crypto error: {0}")]
    Crypto(#[from] crate::crypto::CryptoError),

    #[error("Validation error: {0}")]
    Validation(String),

    #[error("Failed to generate a unique invite code after multiple retries")]
    InviteCodeConflict,

    #[error("Unexpected error")]
    Unexpected,
}

impl ErrorExtensions for AppError {
    fn extend(&self) -> async_graphql::Error {
        async_graphql::Error::new(format!("{}", self)).extend_with(|_err, e| {
            match self {
                AppError::Database(_) => e.set("code", "DATABASE_ERROR"),
                AppError::Http(_) => e.set("code", "HTTP_ERROR"),
                AppError::SpotifyAuth(_) => e.set("code", "UNAUTHENTICATED"),
                AppError::Jwt(_) => e.set("code", "JWT_ERROR"),
                AppError::Crypto(_) => e.set("code", "CRYPTO_ERROR"),
                AppError::Validation(_) => e.set("code", "BAD_USER_INPUT"),
                AppError::InviteCodeConflict => e.set("code", "INTERNAL_SERVER_ERROR"),
                AppError::Unexpected => e.set("code", "INTERNAL_SERVER_ERROR"),
            }
        })
    }
}

pub type Result<T> = std::result::Result<T, AppError>;
