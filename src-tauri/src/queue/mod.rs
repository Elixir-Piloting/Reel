use std::sync::{Arc, Mutex};
use crate::models::DownloadItem;

pub type SharedQueue = Arc<Mutex<DownloadQueue>>;

#[derive(Debug)]
pub struct DownloadQueue {
    pub items: Vec<DownloadItem>,
}

impl DownloadQueue {
    pub fn new() -> Self {
        Self { items: Vec::new() }
    }

    pub fn push(&mut self, item: DownloadItem) {
        self.items.push(item);
    }

    pub fn remove(&mut self, id: &str) {
        self.items.retain(|i| i.id != id);
    }

    pub fn update(&mut self, id: &str, f: impl FnOnce(&mut DownloadItem)) {
        if let Some(item) = self.items.iter_mut().find(|i| i.id == id) {
            f(item);
        }
    }

    pub fn next_queued(&self) -> Option<usize> {
        self.items.iter().position(|i| i.status == crate::models::DownloadStatus::Queued)
    }

    pub fn get(&self, id: &str) -> Option<&DownloadItem> {
        self.items.iter().find(|i| i.id == id)
    }

    pub fn snapshot(&self) -> Vec<DownloadItem> {
        self.items.clone()
    }
}
