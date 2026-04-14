use async_graphql::ErrorExtensions;

#[derive(thiserror::Error, Debug)]
pub enum AppError {
    #[error("Database error: {0}")]
    Database(#[from] mongodb::error::Error),

    #[error("Unexpected error")]
    Unexpected,
}

impl ErrorExtensions for AppError {
    fn extend(&self) -> async_graphql::Error {
        async_graphql::Error::new(format!("{}", self)).extend_with(|_err, e| {
            match self {
                AppError::Database(_) => e.set("code", "DATABASE_ERROR"),
                AppError::Unexpected => e.set("code", "INTERNAL_SERVER_ERROR"),
            }
        })
    }
}

pub type Result<T> = std::result::Result<T, AppError>;
