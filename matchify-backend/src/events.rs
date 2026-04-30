use dashmap::DashMap;
use mongodb::bson::oid::ObjectId;
use tokio::sync::broadcast;

pub type Track = crate::model::song::SongGql;

#[derive(Clone, Debug)]
pub enum PlaylistEvent {
    TrackApproved(Track),
    NewProposal(Track),
}

#[derive(Clone)]
pub struct EventBroker {
    channels: DashMap<ObjectId, broadcast::Sender<PlaylistEvent>>,
}

impl EventBroker {
    pub fn new() -> Self {
        Self {
            channels: DashMap::new(),
        }
    }

    pub fn subscribe(&self, playlist_id: ObjectId) -> broadcast::Receiver<PlaylistEvent> {
        let entry = self.channels.entry(playlist_id).or_insert_with(|| {
            let (tx, _) = broadcast::channel(128);
            tx
        });
        entry.subscribe()
    }

    pub fn publish(&self, playlist_id: ObjectId, event: PlaylistEvent) {
        let mut should_remove = false;
        if let Some(tx) = self.channels.get(&playlist_id) {
            let _ = tx.send(event);
            if tx.receiver_count() == 0 {
                should_remove = true;
            }
        }
        if should_remove {
            self.channels.remove(&playlist_id);
        }
    }
}

impl Default for EventBroker {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::song::TrackStatus;
    use chrono::Utc;

    fn dummy_track() -> Track {
        Track {
            id: ObjectId::new().to_hex(),
            playlist_id: ObjectId::new().to_hex(),
            spotify_track_id: "test".to_string(),
            title: "Test".to_string(),
            artist: "Test".to_string(),
            album: "Test".to_string(),
            album_art_url: "Test".to_string(),
            preview_url: None,
            duration_ms: 1000,
            proposed_by: ObjectId::new().to_hex(),
            status: TrackStatus::Pending,
            like_count: 0,
            created_at: Utc::now(),
        }
    }

    #[tokio::test]
    async fn test_broker_routing_and_cleanup() {
        let broker = EventBroker::new();
        let playlist1 = ObjectId::new();
        let playlist2 = ObjectId::new();

        let mut sub1 = broker.subscribe(playlist1);
        let mut sub2 = broker.subscribe(playlist1);
        let mut sub3 = broker.subscribe(playlist2);

        assert_eq!(broker.channels.len(), 2);

        let event1 = PlaylistEvent::NewProposal(dummy_track());
        broker.publish(playlist1, event1.clone());

        let recv1 = sub1.recv().await.unwrap();
        let recv2 = sub2.recv().await.unwrap();
        
        assert!(matches!(recv1, PlaylistEvent::NewProposal(_)));
        assert!(matches!(recv2, PlaylistEvent::NewProposal(_)));

        assert!(sub3.try_recv().is_err());

        drop(sub1);
        drop(sub2);

        broker.publish(playlist1, PlaylistEvent::NewProposal(dummy_track()));
        
        assert!(broker.channels.get(&playlist1).is_none());
        assert!(broker.channels.get(&playlist2).is_some());
    }
}
