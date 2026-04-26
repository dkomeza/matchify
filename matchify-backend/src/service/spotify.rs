use crate::config::AppConfig;
use crate::crypto::{decrypt_token, encrypt_token};
use crate::error::{AppError, Result};
use crate::model::spotify::{SpotifyProfile, SpotifyTokens};
use crate::model::user::User;
use chrono::{Duration, Utc};
use mongodb::bson::doc;
use mongodb::Database;
use reqwest::Client;
use std::collections::HashMap;
use crate::model::spotify::SpotifyTrack;

#[derive(serde::Deserialize)]
struct SpotifySearchResponse {
    tracks: SpotifySearchTracks,
}

#[derive(serde::Deserialize)]
struct SpotifySearchTracks {
    items: Vec<SpotifySearchItem>,
}

#[derive(serde::Deserialize)]
struct SpotifySearchItem {
    id: String,
    name: String,
    artists: Vec<SpotifySearchArtist>,
    album: SpotifySearchAlbum,
    preview_url: Option<String>,
    duration_ms: i32,
}

#[derive(serde::Deserialize)]
struct SpotifySearchArtist {
    name: String,
}

#[derive(serde::Deserialize)]
struct SpotifySearchAlbum {
    name: String,
    images: Vec<crate::model::spotify::SpotifyImage>,
}

#[derive(Clone)]
pub struct SpotifyClient {
    client_id: String,
    client_secret: String,
    client: Client,
    base_url_accounts: String,
    base_url_api: String,
}

impl SpotifyClient {
    pub fn new(client_id: String, client_secret: String) -> Self {
        Self {
            client_id,
            client_secret,
            client: Client::new(),
            base_url_accounts: "https://accounts.spotify.com".to_string(),
            base_url_api: "https://api.spotify.com".to_string(),
        }
    }

    #[cfg(test)]
    pub fn with_base_urls(
        client_id: String,
        client_secret: String,
        base_url_accounts: String,
        base_url_api: String,
    ) -> Self {
        Self {
            client_id,
            client_secret,
            client: Client::new(),
            base_url_accounts,
            base_url_api,
        }
    }

    pub async fn exchange_code(&self, code: &str, redirect_uri: &str) -> Result<SpotifyTokens> {
        let url = format!("{}/api/token", self.base_url_accounts);

        let mut form = HashMap::new();
        form.insert("grant_type", "authorization_code");
        form.insert("code", code);
        form.insert("redirect_uri", redirect_uri);

        let response = self
            .client
            .post(&url)
            .basic_auth(&self.client_id, Some(&self.client_secret))
            .header("Content-Type", "application/x-www-form-urlencoded")
            .form(&form)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            return Err(AppError::SpotifyAuth(format!(
                "Token exchange failed ({}): {}",
                status, error_text
            )));
        }

        let tokens = response.json::<SpotifyTokens>().await?;
        Ok(tokens)
    }

    pub async fn refresh_token(&self, refresh_token: &str) -> Result<SpotifyTokens> {
        let url = format!("{}/api/token", self.base_url_accounts);

        let mut form = HashMap::new();
        form.insert("grant_type", "refresh_token");
        form.insert("refresh_token", refresh_token);

        let response = self
            .client
            .post(&url)
            .basic_auth(&self.client_id, Some(&self.client_secret))
            .header("Content-Type", "application/x-www-form-urlencoded")
            .form(&form)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            return Err(AppError::SpotifyAuth(format!(
                "Token refresh failed ({}): {}",
                status, error_text
            )));
        }

        let tokens = response.json::<SpotifyTokens>().await?;
        Ok(tokens)
    }

    pub async fn get_user_profile(&self, access_token: &str) -> Result<SpotifyProfile> {
        let url = format!("{}/v1/me", self.base_url_api);

        let response = self
            .client
            .get(&url)
            .bearer_auth(access_token)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            return Err(AppError::SpotifyAuth(format!(
                "Failed to fetch profile ({}): {}",
                status, error_text
            )));
        }

        let profile = response.json::<SpotifyProfile>().await?;
        Ok(profile)
    }

    pub async fn search_tracks(
        &self,
        query: &str,
        limit: u32,
        access_token: &str,
    ) -> Result<Vec<SpotifyTrack>> {
        let actual_limit = limit.min(50).max(1);
        let url = format!("{}/v1/search", self.base_url_api);
        
        let response = self
            .client
            .get(&url)
            .query(&[("q", query), ("type", "track"), ("limit", &actual_limit.to_string())])
            .bearer_auth(access_token)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            return Err(AppError::SpotifyAuth(format!(
                "Failed to search tracks ({}): {}",
                status, error_text
            )));
        }

        let search_response = response.json::<SpotifySearchResponse>().await?;
        
        let tracks = search_response.tracks.items.into_iter().map(|item| {
            let artist_str = item.artists.into_iter().map(|a| a.name).collect::<Vec<_>>().join(", ");
            let album_art_url = item.album.images.first().map(|img| img.url.clone()).unwrap_or_default();
            
            SpotifyTrack {
                spotify_track_id: item.id,
                title: item.name,
                artist: artist_str,
                album: item.album.name,
                album_art_url,
                preview_url: item.preview_url,
                duration_ms: item.duration_ms,
            }
        }).collect();

        Ok(tracks)
    }
}

pub async fn get_valid_access_token(
    user: &User,
    client: &SpotifyClient,
    db: &Database,
    config: &AppConfig,
) -> Result<String> {
    if user.token_expires_at > Utc::now() + Duration::minutes(5) {
        let current_access = decrypt_token(&user.access_token, &config.encryption_key)?;
        return Ok(current_access);
    }

    let decrypted_refresh = decrypt_token(&user.refresh_token, &config.encryption_key)?;
    let new_tokens = client.refresh_token(&decrypted_refresh).await?;

    let new_decrypted_access = new_tokens.access_token;
    
    let encrypted_access = encrypt_token(&new_decrypted_access, &config.encryption_key)?;
    
    let (encrypted_refresh, is_new_refresh) = match new_tokens.refresh_token {
        Some(rt) => (encrypt_token(&rt, &config.encryption_key)?, true),
        None => (user.refresh_token.clone(), false),
    };

    let new_expires_at = Utc::now() + Duration::seconds(new_tokens.expires_in as i64);
    let collection = db.collection::<User>("users");
    
    let mut update_doc = doc! {
        "access_token": encrypted_access,
        "token_expires_at": mongodb::bson::DateTime::from_millis(new_expires_at.timestamp_millis())
    };

    if is_new_refresh {
        update_doc.insert("refresh_token", encrypted_refresh);
    }

    collection
        .update_one(
            doc! { "_id": user.id },
            doc! { "$set": update_doc }
        )
        .await?;

    Ok(new_decrypted_access)
}

#[cfg(test)]
mod tests {
    use super::*;
    use mockito::Server;

    #[tokio::test]
    async fn test_exchange_code_success() {
        let mut server = Server::new_async().await;
        
        let mock_response = r#"{
            "access_token": "mock_access_token",
            "token_type": "Bearer",
            "scope": "user-read-private user-read-email",
            "expires_in": 3600,
            "refresh_token": "mock_refresh_token"
        }"#;

        let mock = server
            .mock("POST", "/api/token")
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(mock_response)
            .create_async()
            .await;

        let client = SpotifyClient::with_base_urls(
            "client_id".to_string(),
            "client_secret".to_string(),
            server.url(),
            server.url(), // API URL, but not used here
        );

        let tokens = client.exchange_code("auth_code", "http://localhost/callback").await.unwrap();
        assert_eq!(tokens.access_token, "mock_access_token");
        assert_eq!(tokens.refresh_token.unwrap(), "mock_refresh_token");
        assert_eq!(tokens.expires_in, 3600);

        mock.assert_async().await;
    }

    #[tokio::test]
    async fn test_exchange_code_failure() {
        let mut server = Server::new_async().await;
        
        let mock = server
            .mock("POST", "/api/token")
            .with_status(400)
            .with_body(r#"{"error": "invalid_grant"}"#)
            .create_async()
            .await;

        let client = SpotifyClient::with_base_urls(
            "client_id".to_string(),
            "client_secret".to_string(),
            server.url(),
            server.url(),
        );

        let error = client.exchange_code("auth_code", "http://localhost/callback").await.unwrap_err();
        match error {
            AppError::SpotifyAuth(msg) => {
                assert!(msg.contains("invalid_grant"));
            }
            _ => panic!("Expected SpotifyAuth error"),
        }

        mock.assert_async().await;
    }

    #[tokio::test]
    async fn test_refresh_token_success() {
        let mut server = Server::new_async().await;
        
        let mock_response = r#"{
            "access_token": "new_mock_access_token",
            "token_type": "Bearer",
            "scope": "user-read-private user-read-email",
            "expires_in": 3600
        }"#;

        let mock = server
            .mock("POST", "/api/token")
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(mock_response)
            .create_async()
            .await;

        let client = SpotifyClient::with_base_urls(
            "client_id".to_string(),
            "client_secret".to_string(),
            server.url(),
            server.url(), // API URL
        );

        let tokens = client.refresh_token("old_refresh_token").await.unwrap();
        assert_eq!(tokens.access_token, "new_mock_access_token");
        assert!(tokens.refresh_token.is_none());
        assert_eq!(tokens.expires_in, 3600);

        mock.assert_async().await;
    }

    #[tokio::test]
    async fn test_get_user_profile_success() {
        let mut server = Server::new_async().await;
        
        let mock_response = r#"{
            "id": "mock_user_id",
            "display_name": "Mock User",
            "email": "mock@example.com",
            "images": [
                {
                    "url": "https://example.com/image.jpg",
                    "height": 300,
                    "width": 300
                }
            ]
        }"#;

        let mock = server
            .mock("GET", "/v1/me")
            .match_header("authorization", "Bearer mock_access_token")
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(mock_response)
            .create_async()
            .await;

        let client = SpotifyClient::with_base_urls(
            "client_id".to_string(),
            "client_secret".to_string(),
            server.url(), // Accounts URL
            server.url(), // API URL
        );

        let profile = client.get_user_profile("mock_access_token").await.unwrap();
        assert_eq!(profile.id, "mock_user_id");
        assert_eq!(profile.display_name.unwrap(), "Mock User");
        assert_eq!(profile.email.unwrap(), "mock@example.com");
        assert_eq!(profile.images.len(), 1);
        assert_eq!(profile.images[0].url, "https://example.com/image.jpg");

        mock.assert_async().await;
    }
}
