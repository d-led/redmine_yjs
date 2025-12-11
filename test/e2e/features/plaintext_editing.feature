@plaintext
Feature: Plain text editor collaborative editing
    Real-time collaborative editing in plain text editor (no CKEditor)
    using Yjs CRDT synchronization via Hocuspocus WebSocket server.

    Background:
        Given Redmine is running with Yjs collaborative editing enabled
        And Redmine is configured with plain text editor
        And a test project "Test Project" exists
        And an issue "Test Issue" exists in "Test Project"

    @ui @plaintext
    Scenario: Two users collaborate in plain text editor
        Given user "admin" opens the issue in browser A
        And user "admin" opens the same issue in browser B
        And the editor is empty
        When user types "Plain text line 1" in browser A's editor
        Then browser B's editor shows "Plain text line 1"
        When user types "\nLine 2 from B" in browser B's editor
        Then browser A's editor shows "Plain text line 1\nLine 2 from B"
        And browser B's editor shows "Plain text line 1\nLine 2 from B"

    @ui @plaintext
    Scenario: Cursor positions are correct in plain text editor
        Given user "admin" opens the issue in browser A
        And user "admin" opens the same issue in browser B
        And the editor is empty
        When user types "Line 1\nLine 2\nLine 3" in browser A's editor
        And user sets cursor to position 5 in browser A's editor
        Then browser B shows a cursor at the correct vertical position for browser A
        When user types "X" in browser A's editor
        Then browser B's editor shows "Line X1\nLine 2\nLine 3"

    @ui @plaintext
    Scenario: Concurrent edits merge correctly in plain text editor
        Given user "admin" opens the issue in browser A
        And user "admin" opens the same issue in browser B
        And the editor is empty
        When user types "Start" in browser A's editor
        And user types "End" in browser B's editor
        Then browser A's editor shows "StartEnd"
        And browser B's editor shows "StartEnd"

    @ui @plaintext
    Scenario: Browser reload preserves content in plain text editor
        Given user "admin" opens the issue in browser A
        And user "admin" opens the same issue in browser B
        And the editor is empty
        When user types "Plain text content" in browser A's editor
        Then browser B's editor shows "Plain text content"
        When browser B reloads the page
        Then browser B's editor shows exactly "Plain text content"
        And browser B's editor does not show "Plain text contentPlain text content"

