use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce, Key
};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use rand::{rngs::OsRng, RngCore};
use std::string::FromUtf8Error;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum CryptoError {
    #[error("Encryption error")]
    EncryptionFailed,
    #[error("Decryption error")]
    DecryptionFailed,
    #[error("Base64 decode error: {0}")]
    Base64DecodeError(#[from] base64::DecodeError),
    #[error("UTF8 error: {0}")]
    Utf8Error(#[from] FromUtf8Error),
    #[error("Invalid key length: must be 32 bytes")]
    InvalidKeyLength,
}

pub type Result<T> = std::result::Result<T, CryptoError>;

/// Encrypts a cleartext string using AES-256-GCM.
/// The output is base64-encoded in the format: `nonce_base64:ciphertext_base64`
pub fn encrypt_token(cleartext: &str, key: &str) -> Result<String> {
    if key.len() != 32 {
        return Err(CryptoError::InvalidKeyLength);
    }
    
    let key_bytes = Key::<Aes256Gcm>::from_slice(key.as_bytes());
    let cipher = Aes256Gcm::new(key_bytes);
    
    let mut nonce_bytes = [0u8; 12];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    
    let ciphertext = cipher
        .encrypt(nonce, cleartext.as_bytes())
        .map_err(|_| CryptoError::EncryptionFailed)?;
        
    let nonce_b64 = STANDARD.encode(nonce);
    let cipher_b64 = STANDARD.encode(ciphertext);
    
    Ok(format!("{}:{}", nonce_b64, cipher_b64))
}

/// Decrypts a base64-encoded encrypted string using AES-256-GCM.
pub fn decrypt_token(encrypted: &str, key: &str) -> Result<String> {
    if key.len() != 32 {
        return Err(CryptoError::InvalidKeyLength);
    }
    
    let parts: Vec<&str> = encrypted.split(':').collect();
    if parts.len() != 2 {
        return Err(CryptoError::DecryptionFailed);
    }
    
    let nonce_bytes = STANDARD.decode(parts[0])?;
    let cipher_bytes = STANDARD.decode(parts[1])?;
    
    let key_bytes = Key::<Aes256Gcm>::from_slice(key.as_bytes());
    let cipher = Aes256Gcm::new(key_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    
    let cleartext_bytes = cipher
        .decrypt(nonce, cipher_bytes.as_ref())
        .map_err(|_| CryptoError::DecryptionFailed)?;
        
    String::from_utf8(cleartext_bytes).map_err(Into::into)
}
