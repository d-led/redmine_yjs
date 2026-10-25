require 'base64'
require 'json'
require 'openssl'

module RedmineYjs
  # The wire format shared with the Hocuspocus server.
  #
  # A token is `<base64url(payload json)>.<base64url(hmac-sha256)>`; Hocuspocus
  # verifies it in hocuspocus/auth.js, which is the counterpart of this file.
  # Keep the two in step - test/unit/token_test.rb and
  # test/unit/token-contract.test.js exist to catch exactly that.
  module Token
    # Tokens are single-use short-lived: a page load signs a fresh one.
    TTL = 10 * 60

    module_function

    # @param user_id  [Integer, String] Redmine user id
    # @param login    [String]  Redmine login, shown in presence
    # @param document [String]  RedmineYjs::DocumentName for the page
    # @param secret   [String]  shared with Hocuspocus
    # @param now      [Time]    injectable for tests
    def issue(user_id:, login:, document:, secret:, now: Time.now)
      sign({ uid: user_id, login: login, doc: document, exp: now.to_i + TTL }, secret)
    end

    def sign(payload, secret)
      payload_json = JSON.generate(payload)

      "#{encode(payload_json)}.#{encode(OpenSSL::HMAC.digest('SHA256', secret, payload_json))}"
    end

    def encode(bytes)
      Base64.urlsafe_encode64(bytes, padding: false)
    end
  end
end
