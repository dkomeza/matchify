use crate::error::{AppError, Result};
use crate::model::recommendation::RecommendationCandidate;
use reqwest::Client;
use serde::Deserialize;

#[derive(Clone)]
pub struct LastfmClient {
    api_key: String,
    client: Client,
    base_url: String,
}

impl LastfmClient {
    pub fn new(api_key: String) -> Self {
        Self {
            api_key,
            client: Client::new(),
            base_url: "https://ws.audioscrobbler.com".to_string(),
        }
    }

    #[cfg(test)]
    pub fn with_base_url(api_key: String, base_url: String) -> Self {
        Self {
            api_key,
            client: Client::new(),
            base_url,
        }
    }

    pub async fn similar_tracks(
        &self,
        artist: &str,
        track: &str,
        limit: u32,
    ) -> Result<Vec<RecommendationCandidate>> {
        let actual_limit = limit.clamp(1, 50);
        let url = format!("{}/2.0/", self.base_url);
        let response = self
            .client
            .get(&url)
            .query(&[
                ("method", "track.getsimilar"),
                ("artist", artist),
                ("track", track),
                ("api_key", &self.api_key),
                ("format", "json"),
                ("autocorrect", "1"),
                ("limit", &actual_limit.to_string()),
            ])
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            return Err(AppError::Validation(format!(
                "Last.fm similar tracks failed ({}): {}",
                status, error_text
            )));
        }

        let body = response.text().await?;
        parse_similar_tracks_response(&body)
    }
}

#[derive(Deserialize)]
struct LastfmSimilarTracksResponse {
    similartracks: LastfmSimilarTracks,
}

#[derive(Deserialize)]
struct LastfmSimilarTracks {
    #[serde(default)]
    track: Vec<LastfmSimilarTrack>,
}

#[derive(Deserialize)]
struct LastfmSimilarTrack {
    name: String,
    artist: LastfmArtist,
    #[serde(rename = "match", deserialize_with = "deserialize_match_score")]
    match_score: f64,
}

#[derive(Deserialize)]
struct LastfmArtist {
    name: String,
}

fn deserialize_match_score<'de, D>(deserializer: D) -> std::result::Result<f64, D::Error>
where
    D: serde::Deserializer<'de>,
{
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum MatchValue {
        Number(f64),
        String(String),
    }

    match MatchValue::deserialize(deserializer)? {
        MatchValue::Number(value) => Ok(value),
        MatchValue::String(value) => value.parse::<f64>().map_err(serde::de::Error::custom),
    }
}

pub fn parse_similar_tracks_response(body: &str) -> Result<Vec<RecommendationCandidate>> {
    let response: LastfmSimilarTracksResponse =
        serde_json::from_str(body).map_err(|_| AppError::Unexpected)?;

    Ok(response
        .similartracks
        .track
        .into_iter()
        .filter(|track| !track.name.trim().is_empty() && !track.artist.name.trim().is_empty())
        .map(|track| RecommendationCandidate {
            title: track.name,
            artist: track.artist.name,
            match_score: track.match_score,
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_similar_tracks_response() {
        let body = r#"{
            "similartracks": {
                "track": [
                    {
                        "name": "Ray of Light",
                        "match": "10.95",
                        "artist": { "name": "Madonna" }
                    },
                    {
                        "name": "Frozen",
                        "match": 8.5,
                        "artist": { "name": "Madonna" }
                    }
                ]
            }
        }"#;

        let tracks = parse_similar_tracks_response(body).expect("response should parse");

        assert_eq!(tracks.len(), 2);
        assert_eq!(tracks[0].title, "Ray of Light");
        assert_eq!(tracks[0].artist, "Madonna");
        assert_eq!(tracks[0].match_score, 10.95);
        assert_eq!(tracks[1].title, "Frozen");
        assert_eq!(tracks[1].match_score, 8.5);
    }
}
