@concurrent
Feature: Wiki page collaborative editing
    Real-time collaborative editing on wiki pages.

    Background:
        Given Redmine is running with Yjs collaborative editing enabled
        And a test project "Test Project" exists
        And a wiki page "TestPage" exists in "Test Project"

    @ui
    Scenario: Two users collaborate on a wiki page
        Given user "admin" opens the wiki page edit in browser A
        And user "admin" opens the same wiki page edit in browser B
        And the editor is empty
        When user types "Wiki content from A" in browser A's editor
        Then browser B's editor shows "Wiki content from A"
        When user types " | Wiki content from B" in browser B's editor
        Then browser A's editor shows "Wiki content from A | Wiki content from B"

