use async_graphql::{Context, Object, SimpleObject};
use chrono::{Duration, Utc};
use mongodb::{
    bson::{doc, oid::ObjectId},
    options::{FindOneAndUpdateOptions, ReturnDocument},
    Database,
};

use crate::{
    crypto::encrypt_token,
    error::{AppError, Result},
    jwt,
    model::user::User,
    service::spotify::SpotifyClient,
};

#[derive(SimpleObject)]
pub struct AuthPayload {
    token: String,
    user: User,
}

pub struct Mutation;

#[Object]
impl Mutation {
    async fn login_with_spotify(
        &self,
        ctx: &Context<'_>,
        code: String,
        redirect_uri: String,
    ) -> Result<AuthPayload> {
        let spotify_client = ctx.data::<SpotifyClient>().map_err(|_| AppError::Unexpected)?;
        let db = ctx.data::<Database>().map_err(|_| AppError::Unexpected)?;
        let config = ctx.data::<crate::config::AppConfig>().map_err(|_| AppError::Unexpected)?;

        let tokens = spotify_client.exchange_code(&code, &redirect_uri).await?;
        let profile = spotify_client.get_user_profile(&tokens.access_token).await?;

        let encrypted_access = encrypt_token(&tokens.access_token, &config.encryption_key)?;
        let encrypted_refresh = tokens
            .refresh_token
            .as_deref()
            .map(|rt| encrypt_token(rt, &config.encryption_key))
            .transpose()?
            .unwrap_or_else(|| "".to_string());

        let expires_at = Utc::now() + Duration::seconds(tokens.expires_in as i64);

        let collection = db.collection::<User>("users");
        
        let mut set_doc = doc! {
            "display_name": profile.display_name.unwrap_or_else(|| "Unknown".to_string()),
            "email": profile.email.unwrap_or_default(),
            "access_token": encrypted_access,
            "token_expires_at": mongodb::bson::DateTime::from_millis(expires_at.timestamp_millis()),
        };

        if let Some(img) = profile.images.first() {
            set_doc.insert("profile_image_url", &img.url);
        }

        if !encrypted_refresh.is_empty() {
            set_doc.insert("refresh_token", encrypted_refresh);
        }

        let update = doc! {
            "$set": set_doc,
            "$setOnInsert": {
                "spotify_id": &profile.id,
                "created_at": mongodb::bson::DateTime::from_millis(Utc::now().timestamp_millis()),
            }
        };

        let user = collection
            .find_one_and_update(doc! { "spotify_id": &profile.id }, update)
            .upsert(true)
            .return_document(ReturnDocument::After)
            .await?
            .ok_or(AppError::Unexpected)?;

        let jwt_token = jwt::sign(&user.id, &config.jwt_secret, 7)?;

        Ok(AuthPayload {
            token: jwt_token,
            user,
        })
    }
}
