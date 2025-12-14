@concurrent
Feature: Concurrent collaborative editing
    Real-time collaborative editing between multiple browser sessions
    using Yjs CRDT synchronization via Hocuspocus WebSocket server.

    Background:
        Given Redmine is running with Yjs collaborative editing enabled
        And a test project "Test Project" exists
        And an issue "Test Issue" exists in "Test Project"

    @ui
    Scenario: Two users see each other's presence
        Given user "admin" opens the issue in browser A
        And user "admin" opens the same issue in browser B
        Then browser A shows 1 other editor connected
        And browser B shows 1 other editor connected

    @ui
    Scenario: Real-time text synchronization between two browsers
        Given user "admin" opens the issue in browser A
        And user "admin" opens the same issue in browser B
        When user types "Hello from A" in browser A's editor
        Then browser B's editor shows "Hello from A"
        When user types " and hello from B" in browser B's editor
        Then browser A's editor shows "Hello from A and hello from B"
        And browser B's editor shows "Hello from A and hello from B"

    @ui
    Scenario: Concurrent edits are merged without conflict
        Given user "admin" opens the issue in browser A
        And user "admin" opens the same issue in browser B
        And the editor is empty
        When user types "Start: " at the beginning in browser A's editor
        And user types " :End" at the end in browser B's editor
        Then both browsers show "Start:  :End"


    @ui
    Scenario: Browser reload does not duplicate content
        Given user "admin" opens the issue in browser A
        And user "admin" opens the same issue in browser B
        And the editor is empty
        When user types "First line" in browser A's editor
        And user types " Second line" in browser B's editor
        Then browser A's editor shows "First line Second line"
        And browser B's editor shows "First line Second line"
        When browser B reloads the page
        Then browser B's editor shows exactly "First line Second line"
        And browser B's editor does not show "First line Second lineFirst line Second line"
        And browser A's editor shows exactly "First line Second line"

    @ui
    Scenario: Multiple reloads do not accumulate content
        Given user "admin" opens the issue in browser A
        And user "admin" opens the same issue in browser B
        And the editor is empty
        When user types "Content" in browser A's editor
        Then browser B's editor shows "Content"
        When browser B reloads the page
        Then browser B's editor shows exactly "Content"
        When browser B reloads the page
        Then browser B's editor shows exactly "Content"
        When browser B reloads the page
        Then browser B's editor shows exactly "Content"
        And browser A's editor shows exactly "Content"

    @ui
    Scenario: Collaboration continues after browser reload
        Given user "admin" opens the issue in browser A
        And user "admin" opens the same issue in browser B
        And the editor is empty
        When user types "Before reload" in browser A's editor
        Then browser B's editor shows "Before reload"
        When browser B reloads the page
        Then browser B's editor shows exactly "Before reload"
        # Continue editing after reload - sync should still work
        When user types " - After reload from A" in browser A's editor
        Then browser B's editor shows "Before reload - After reload from A"
        When user types " - And from B" in browser B's editor
        Then browser A's editor shows "Before reload - After reload from A - And from B"
        And browser B's editor shows "Before reload - After reload from A - And from B"

    @ui
    Scenario: Changes merge when another user saves while editing
        Given user "admin" opens the issue in browser A
        And user "admin" opens the same issue in browser B
        And the editor is empty
        # User A starts editing
        When user types "Content from A" in browser A's editor
        Then browser B's editor shows "Content from A"
        # User B adds content and saves (this updates the database)
        When user types " | Saved by B" in browser B's editor
        Then browser A's editor shows "Content from A | Saved by B"
        When user saves the issue in browser B
        # User A continues editing (has unsaved changes)
        When user types " | Added after B saved" in browser A's editor
        Then browser A's editor shows "Content from A | Saved by B | Added after B saved"
        # User A saves - this should trigger merge with B's saved content
        When user saves the issue in browser A
        # After save, verify the merged content is saved correctly
        # Browser A is redirected after save, so navigate back to edit
        Given user "admin" opens the issue in browser A
        Then browser A's editor shows "Content from A | Saved by B | Added after B saved"
        # Browser B should also see the final merged content when navigating to edit
        Given user "admin" opens the same issue in browser B
        Then browser B's editor shows "Content from A | Saved by B | Added after B saved"

    @ui
    Scenario: Stale object error is handled gracefully with merge
        Given user "admin" opens the issue in browser A
        And user "admin" opens the same issue in browser B
        And the editor is empty
        # User A types and prepares to save
        When user types "Initial content" in browser A's editor
        Then browser B's editor shows "Initial content"
        # User B saves first (this will cause stale object error when A saves)
        When user types " | B saved first" in browser B's editor
        Then browser A's editor shows "Initial content | B saved first"
        When user saves the issue in browser B
        # User A adds more content (has unsaved changes that will conflict)
        When user types " | A's unsaved changes" in browser A's editor
        Then browser A's editor shows "Initial content | B saved first | A's unsaved changes"
        # User A saves - this should trigger stale object error, merge, and retry
        # The error message should NOT be shown to the user
        When user saves the issue in browser A
        # Verify no error message is shown
        Then browser A should not show "Data has been updated by another user"
        # After save completes, verify merged content is correct
        # Browser A is redirected after save, so navigate back to edit
        Given user "admin" opens the issue in browser A
        # The merged content should include both B's saved content and A's changes
        Then browser A's editor shows "Initial content | B saved first | A's unsaved changes"
        # Browser B should also see the final merged content
        Given user "admin" opens the same issue in browser B
        Then browser B's editor shows "Initial content | B saved first | A's unsaved changes"

