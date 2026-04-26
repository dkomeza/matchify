use axum::{
    extract::FromRequestParts,
    http::{StatusCode, request::Parts},
};

use jsonwebtoken::{DecodingKey, EncodingKey, Header, Validation, decode, encode};
use mongodb::bson::oid::ObjectId;
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Claims {
    pub sub: String,
    pub exp: usize,
    pub iat: usize,
}

pub fn sign(user_id: &ObjectId, secret: &str, ttl_days: u64) -> crate::error::Result<String> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| crate::error::AppError::Unexpected)?
        .as_secs() as usize;

    let exp = now + (ttl_days as usize * 24 * 3600);

    let claims = Claims {
        sub: user_id.to_hex(),
        exp,
        iat: now,
    };

    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_ref()),
    )
    .map_err(crate::error::AppError::Jwt)
}

pub fn verify(token: &str, secret: &str) -> crate::error::Result<Claims> {
    let token_data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_ref()),
        &Validation::default(),
    )
    .map_err(crate::error::AppError::Jwt)?;
    Ok(token_data.claims)
}

#[derive(Debug, Clone)]
pub struct AuthUser {
    pub user_id: String,
}

pub struct OptionalAuthUser(pub Option<AuthUser>);

impl<S> FromRequestParts<S> for AuthUser
where
    S: Send + Sync,
{
    type Rejection = (StatusCode, String);

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let optional_user = OptionalAuthUser::from_request_parts(parts, state).await?;
        match optional_user.0 {
            Some(user) => Ok(user),
            None => Err((
                StatusCode::UNAUTHORIZED,
                "Missing Authorization header".to_string(),
            )),
        }
    }
}

impl<S> FromRequestParts<S> for OptionalAuthUser
where
    S: Send + Sync,
{
    type Rejection = (StatusCode, String);

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        let auth_header = parts
            .headers
            .get(axum::http::header::AUTHORIZATION)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.strip_prefix("Bearer "));

        let token = match auth_header {
            Some(t) => t,
            None => return Ok(OptionalAuthUser(None)),
        };

        let secret = if let Some(config) = parts
            .extensions
            .get::<std::sync::Arc<crate::config::AppConfig>>()
        {
            config.jwt_secret.clone()
        } else {
            return Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                "Config extension not found".to_string(),
            ));
        };

        match verify(token, &secret) {
            Ok(claims) => Ok(OptionalAuthUser(Some(AuthUser {
                user_id: claims.sub,
            }))),
            Err(e) => Err((StatusCode::UNAUTHORIZED, format!("Invalid token: {}", e))),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{sign, verify};
    use mongodb::bson::oid::ObjectId;

    #[test]
    fn signs_and_verifies_jwt() {
        let user_id = ObjectId::new();
        let secret = "a".repeat(32);

        let token = sign(&user_id, &secret, 7).expect("jwt should sign");
        let claims = verify(&token, &secret).expect("jwt should verify");

        assert_eq!(claims.sub, user_id.to_hex());
    }
}
