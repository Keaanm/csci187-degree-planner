#include "Auth.h"

#include <stdexcept>

#include <sodium.h>

namespace auth {

void init() {
  if (sodium_init() < 0) throw std::runtime_error("Can't start libsodium");
}

std::string hashPassword(const std::string& password) {
  char hash[crypto_pwhash_STRBYTES];
  if (crypto_pwhash_str(hash, password.c_str(), password.size(), crypto_pwhash_OPSLIMIT_INTERACTIVE,
                        crypto_pwhash_MEMLIMIT_INTERACTIVE) != 0) {
    throw std::runtime_error("Out of memory while hashing a password");
  }
  return hash;
}

bool verifyPassword(const std::string& password, const std::string& hash) {
  return crypto_pwhash_str_verify(hash.c_str(), password.c_str(), password.size()) == 0;
}

void verifyAgainstDummy(const std::string& password) {
  static const std::string dummy = hashPassword("not a real password");
  verifyPassword(password, dummy);
}

std::string newSessionToken() {
  unsigned char bytes[32];
  randombytes_buf(bytes, sizeof bytes);
  char hex[sizeof bytes * 2 + 1];
  sodium_bin2hex(hex, sizeof hex, bytes, sizeof bytes);
  return hex;
}

}  // namespace auth
