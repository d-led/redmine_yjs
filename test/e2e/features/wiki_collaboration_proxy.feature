@concurrent @proxy
Feature: Wiki page collaborative editing via ActionCable proxy
    Real-time collaborative editing on wiki pages using ActionCable WebSocket proxy mode.

    Background:
        Given Redmine is running with Yjs collaborative editing enabled in proxy mode
        And a test project "Test Project Proxy" exists in proxy mode
        And a wiki page "TestPageProxy" exists in "Test Project Proxy" in proxy mode

    @ui
    Scenario: Two users collaborate on a wiki page via ActionCable proxy
        Given user "admin" opens the wiki page edit in browser A using proxy mode
        And user "admin" opens the same wiki page edit in browser B using proxy mode
        When user types "Proxy content from A" in browser A's editor
        Then browser B's editor shows "Proxy content from A"
        When user types " | Proxy content from B" in browser B's editor
        Then browser A's editor shows "Proxy content from A | Proxy content from B"

