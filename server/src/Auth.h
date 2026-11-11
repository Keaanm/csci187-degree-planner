#pragma once

#include <string>

// Passwords and session tokens, using libsodium.
namespace auth {

// Call once before anything else in this file. Throws if libsodium can't start.
void init();

// A slow, salted argon2id hash. The salt and settings are stored inside the returned
// string, so it's the only thing that needs saving.
std::string hashPassword(const std::string& password);

// True if password matches a hash from hashPassword.
bool verifyPassword(const std::string& password, const std::string& hash);

// Runs as long as verifyPassword, for logins with an unknown email, so the response
// time doesn't show whether an email has an account.
void verifyAgainstDummy(const std::string& password);

// 32 random bytes as 64 hex characters.
std::string newSessionToken();

}  // namespace auth
