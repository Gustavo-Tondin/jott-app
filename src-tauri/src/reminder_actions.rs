//! A reminder answered with no window: the phone's notification buttons, from
//! a broadcast receiver in a process the app may never have started
//! (`ReminderActionReceiver.kt`). One JSON request in; the rule is the core's
//! (`act_on_reminder`), and this only opens the notebook it names.

use std::path::PathBuf;

use chrono::{Local, TimeZone};
use jott_core::reminders::ReminderAction;
use jott_core::Notebook;
use serde::{Deserialize, Serialize};

/// What the receiver sends: the notebook, this device's name (so the ack
/// lands in its own file), and the reminder with what was done to it.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Request {
    pub root: PathBuf,
    pub device: Option<String>,
    pub list: String,
    pub id: String,
    pub at: String,
    pub action: String,
}

/// The answer: where Later/Tomorrow moved the reminder, as the file writes
/// it and in epoch milliseconds for the alarm — or what went wrong.
#[derive(Debug, Default, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Reply {
    pub moved: Option<String>,
    pub moved_millis: Option<i64>,
    pub error: Option<String>,
}

/// Runs one request, as JSON in and JSON out.
pub fn act_json(request: &str) -> String {
    let reply = match serde_json::from_str::<Request>(request) {
        Ok(request) => act(&request).unwrap_or_else(|error| Reply { error: Some(error), ..Reply::default() }),
        Err(e) => Reply { error: Some(format!("unreadable request: {e}")), ..Reply::default() },
    };
    serde_json::to_string(&reply).unwrap_or_else(|_| "{}".to_string())
}

pub fn act(request: &Request) -> Result<Reply, String> {
    let action = ReminderAction::parse(&request.action).ok_or_else(|| format!("no action {:?}", request.action))?;
    let at = jott_core::task::parse_datetime(&request.at).ok_or_else(|| format!("{:?} is not a moment", request.at))?;
    if let Some(device) = request.device.as_deref() {
        jott_core::seen::claim_device(device);
    }
    let notebook = Notebook::open(&request.root).map_err(|e| e.to_string())?;
    let moved = notebook
        .act_on_reminder(&request.list, &request.id, at, action, jott_core::clock::civil_now())
        .map_err(|e| e.to_string())?;
    Ok(Reply {
        moved: moved.map(jott_core::task::render_datetime),
        moved_millis: moved.and_then(|at| Local.from_local_datetime(&at).earliest()).map(|at| at.timestamp_millis()),
        error: None,
    })
}

/// `ReminderCore.act(request)` in Kotlin.
#[cfg(target_os = "android")]
#[no_mangle]
pub extern "system" fn Java_dev_gustavotondin_jott_ReminderCore_act<'local>(
    mut env: jni::JNIEnv<'local>,
    _class: jni::objects::JClass<'local>,
    request: jni::objects::JString<'local>,
) -> jni::sys::jstring {
    let request: String = match env.get_string(&request) {
        Ok(text) => text.into(),
        Err(_) => return std::ptr::null_mut(),
    };
    let reply = act_json(&request);
    env.new_string(reply).map(|text| text.into_raw()).unwrap_or(std::ptr::null_mut())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn notebook_ringing() -> (tempfile::TempDir, String) {
        let dir = tempfile::tempdir().unwrap();
        let notebook = Notebook::init(dir.path()).unwrap();
        let mut inbox = notebook.inbox().unwrap();
        let id = inbox.add_text_with_id("Ligar pro dentista");
        inbox.save().unwrap();
        let fields = jott_core::task::TaskFields {
            remind: Some(Some("2026-07-24T18:00".into())),
            ..Default::default()
        };
        notebook.set_task_fields(&Notebook::inbox_path(), &id, fields).unwrap();
        (dir, id)
    }

    fn request(dir: &tempfile::TempDir, id: &str, action: &str) -> String {
        serde_json::json!({
            "root": dir.path(), "device": null, "list": Notebook::inbox_path(),
            "id": id, "at": "2026-07-24T18:00", "action": action,
        })
        .to_string()
    }

    #[test]
    fn done_from_the_phone_completes_the_task() {
        let (dir, id) = notebook_ringing();
        assert_eq!(act_json(&request(&dir, &id, "done")), r#"{"moved":null,"movedMillis":null,"error":null}"#);
        let completed = std::fs::read_to_string(dir.path().join("jott.tasks/completed.md")).unwrap();
        assert!(completed.contains("Ligar pro dentista"), "{completed}");
    }

    #[test]
    fn later_and_tomorrow_answer_the_new_moment_for_the_alarm() {
        let (dir, id) = notebook_ringing();
        let reply: serde_json::Value = serde_json::from_str(&act_json(&request(&dir, &id, "later"))).unwrap();
        let moved = reply["moved"].as_str().unwrap().to_string();
        let millis = reply["movedMillis"].as_i64().unwrap();
        let local = Local.timestamp_millis_opt(millis).unwrap().naive_local();
        assert_eq!(jott_core::task::render_datetime(local), moved);
        let file = std::fs::read_to_string(dir.path().join("jott.tasks/task-list.md")).unwrap();
        assert!(file.contains(&format!("remind: {moved}")), "{file}");

        // The old notification's moment is no longer the task's: nothing moves.
        let reply: serde_json::Value = serde_json::from_str(&act_json(&request(&dir, &id, "tomorrow"))).unwrap();
        assert_eq!(reply["moved"], serde_json::Value::Null);
    }

    #[test]
    fn a_request_that_makes_no_sense_says_so() {
        let (dir, id) = notebook_ringing();
        assert!(act_json("nope").contains("unreadable request"));
        assert!(act_json(&request(&dir, &id, "explode")).contains("no action"));
    }
}
