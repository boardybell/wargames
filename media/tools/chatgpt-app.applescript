-- Expected-to-fail automation attempt. Tries to drive ChatGPT.app via
-- System Events to paste a request and save the returned image. This is
-- NOT the sanctioned path: ChatGPT.app offers no stable scripting surface,
-- accessibility automation of its canvas is brittle, and any success is
-- incidental. Treat a failure as the normal outcome, log it, and fall through
-- to the consolidated paste file (media/requests/ALL-REQUESTS.md), which is
-- the primary rung-2 path. Do NOT harden this.
--
-- The probe wraps this in a timeout. If it hangs or errors, the probe records
-- the failure mode in DISCOVERY.md and continues. Run:
--   osascript media/tools/chatgpt-app.applescript "request text here"

on run argv
	set requestText to ""
	if (count of argv) > 0 then set requestText to item 1 of argv
	try
		tell application "ChatGPT" to activate
		delay 1
		tell application "System Events"
			-- No stable text target exists; this is the brittle step that is
			-- expected to fail. Attempt a paste into the frontmost field.
			set the clipboard to requestText
			keystroke "v" using command down
			delay 1
		end tell
		return "chatgpt-app: paste attempted (verify manually; this path is not trusted)"
	on error errMsg
		return "chatgpt-app: FAILED as expected (" & errMsg & "). Fall through to media/requests/ALL-REQUESTS.md"
	end try
end run
