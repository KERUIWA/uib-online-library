/**
 * UIB E-Library shared assignment storage.
 *
 * Add the action branch shown below near the TOP of the existing doGet(e):
 *
 * if (e && e.parameter && e.parameter.action === "assignments") {
 *   return getSharedAssignmentsResponse_(e);
 * }
 *
 * Keep the existing library doGet logic after that branch.
 * This file also adds doPost(e) for shared assignment writes.
 *
 * IMPORTANT: The web app runs as its owner and is publicly writable.
 * Anyone who can reach the endpoint can add, edit, complete, or delete
 * shared assignments. Only deploy this way if that is acceptable.
 */
const SHARED_ASSIGNMENTS_FILE = "uib-shared-assignments.json";
const SHARED_ASSIGNMENTS_FOLDER_ID = "16Oe23ssDju13HQsPrtqvu16Tznkf7c5w";

function getSharedAssignments_() {
  const folder = DriveApp.getFolderById(SHARED_ASSIGNMENTS_FOLDER_ID);
  const files = folder.getFilesByName(SHARED_ASSIGNMENTS_FILE);
  if (!files.hasNext()) return [];
  const file = files.next();
  const parsed = JSON.parse(file.getBlob().getDataAsString("UTF-8"));
  return Array.isArray(parsed) ? parsed : [];
}

function getSharedAssignmentsResponse_(e) {
  let payload;
  try {
    payload = { ok: true, assignments: getSharedAssignments_() };
  } catch (err) {
    payload = { ok: false, error: String(err && err.message || err), assignments: [] };
  }
  const callback = e && e.parameter ? String(e.parameter.callback || "") : "";
  const json = JSON.stringify(payload);
  if (callback && /^[A-Za-z_$][0-9A-Za-z_$]*(?:\\.[A-Za-z_$][0-9A-Za-z_$]*)*$/.test(callback)) {
    return ContentService.createTextOutput(callback + "(" + json + ");")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const raw = e && e.postData && e.postData.contents ? e.postData.contents : "";
    if (!raw || raw.length > 100000) throw new Error("Missing data or payload too large.");
    const incoming = JSON.parse(raw);
    if (!Array.isArray(incoming) || incoming.length > 500) throw new Error("Invalid assignment list.");
    const clean = incoming.map(function (x) {
      if (!x || typeof x !== "object") throw new Error("Invalid assignment record.");
      const title = String(x.title || "").trim().slice(0, 120);
      const course = String(x.course || "").trim().slice(0, 100);
      const due = String(x.due || "");
      const time = String(x.time || "23:59");
      if (!title || !course || !/^\\d{4}-\\d{2}-\\d{2}$/.test(due) || !/^\\d{2}:\\d{2}$/.test(time)) {
        throw new Error("An assignment has missing or invalid required fields.");
      }
      return {
        id: String(x.id || Utilities.getUuid()).slice(0, 80),
        title: title,
        course: course,
        due: due,
        time: time,
        priority: ["Normal", "High", "Urgent"].indexOf(x.priority) >= 0 ? x.priority : "Normal",
        description: String(x.description || "").slice(0, 1000),
        done: x.done === true
      };
    });
    const folder = DriveApp.getFolderById(SHARED_ASSIGNMENTS_FOLDER_ID);
    const files = folder.getFilesByName(SHARED_ASSIGNMENTS_FILE);
    const blob = Utilities.newBlob(JSON.stringify(clean, null, 2), "application/json", SHARED_ASSIGNMENTS_FILE);
    if (files.hasNext()) {
      files.next().setContent(blob.getDataAsString("UTF-8"));
    } else {
      folder.createFile(blob);
    }
    return ContentService.createTextOutput(JSON.stringify({ ok: true, count: clean.length }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err && err.message || err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
