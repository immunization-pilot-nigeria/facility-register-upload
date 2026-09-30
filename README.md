# Register Upload

A lightweight, mobile-friendly web form for authorized health facility staff to submit document photos for a program pilot.

## About

- Static site with no build step or third-party dependencies
- Designed for low-bandwidth Android phones: photos are resized on the device before upload
- Works with weak or no signal: the form opens offline once it has been visited, and submissions are sent automatically when a connection returns
- Can be added to the phone's home screen and used like an app
- No login required for submitters

## Files

| File | Purpose |
|---|---|
| `index.html` | The form |
| `queue.js` | Holds submissions on the device until they send |
| `sw.js` | Lets the form open offline and send in the background |
| `manifest.webmanifest`, `icon-*.png` | Home screen name and icon |

## Data

- **No data is stored in this repository.** It only contains the form.
- Submissions are sent over HTTPS to a secure backend managed by the program team and are accessible only to authorized staff.
- While waiting for a connection, submissions are held temporarily on the submitter's device. They are removed as soon as they send, or automatically after seven days.

## Access

This form is intended only for staff who have received the link directly from the program team. If you reached this page by mistake, please close it.

## Contact

For questions, contact the program team through your usual point of contact.
