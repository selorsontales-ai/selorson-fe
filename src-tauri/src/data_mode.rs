//! Which database the embedded backend talks to.
//!
//! Switching is a restart rather than a live swap, because the backend reads
//! its configuration once and then holds one connection pool for the life of
//! the process. The selected mode is therefore a file, stored beside the
//! configuration files it selects, so the choice survives the restart that
//! applies it — and so the mode is already settled before any page script runs.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

const MODE_FILE: &str = "backend-mode";
/// Written beside the mode whenever a switch asks for a restart, and consumed
/// by the next startup. It is what tells a restart caused by pressing the
/// switch apart from opening the app fresh.
const SWITCH_FILE: &str = "backend-mode.pending";
const LOCAL_ENV_FILE: &str = "backend.env";
const PRODUCTION_ENV_FILE: &str = "backend.production.env";

#[derive(Copy, Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DataMode {
    /// PostgreSQL on this machine. Nothing done here reaches the website.
    Local,
    /// The production database. Every change is live immediately.
    Production,
}

impl DataMode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Local => "local",
            Self::Production => "production",
        }
    }

    fn env_file(self) -> &'static str {
        match self {
            Self::Local => LOCAL_ENV_FILE,
            Self::Production => PRODUCTION_ENV_FILE,
        }
    }

    fn parse(raw: &str) -> Option<Self> {
        match raw.trim() {
            "local" => Some(Self::Local),
            "production" => Some(Self::Production),
            _ => None,
        }
    }
}

/// What the app resolved at startup, including the case where production was
/// asked for and could not be honoured.
#[derive(Clone, Debug, Serialize)]
pub struct DataModeStatus {
    /// The mode actually in force for this process.
    pub mode: DataMode,
    /// The mode the stored choice asked for.
    pub requested: DataMode,
    /// True when production was requested but its configuration is absent, so
    /// the app fell back to local instead of starting against nothing.
    pub fell_back: bool,
    /// Whether a production configuration file exists at all.
    pub production_configured: bool,
    /// Absolute path of the configuration file in force, for the UI to show
    /// when something needs fixing by hand.
    pub config_path: String,
}

pub fn env_path(app_data_dir: &Path, mode: DataMode) -> PathBuf {
    app_data_dir.join(mode.env_file())
}

fn mode_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join(MODE_FILE)
}

/// The stored choice. An absent or unreadable file means local: the safe mode
/// is the one you get when anything is unclear.
pub fn read_requested(app_data_dir: &Path) -> DataMode {
    fs::read_to_string(mode_path(app_data_dir))
        .ok()
        .and_then(|raw| DataMode::parse(&raw))
        .unwrap_or(DataMode::Local)
}

pub fn write_requested(app_data_dir: &Path, mode: DataMode) -> std::io::Result<()> {
    fs::create_dir_all(app_data_dir)?;
    fs::write(mode_path(app_data_dir), mode.as_str())?;
    // The restart this switch is about to trigger has to be told apart from
    // opening the app fresh, which always starts local.
    fs::write(app_data_dir.join(SWITCH_FILE), mode.as_str())
}

/// Resolve the mode this process will run in.
///
/// Production is refused rather than approximated: starting the backend with
/// local credentials while the app says "production" would put real-looking
/// work into the wrong database, which is worse than refusing to start in that
/// mode at all.
pub fn resolve(app_data_dir: &Path) -> DataModeStatus {
    // Opening the app always starts local. Production is never something you
    // arrive in without having asked for it in this session — which is what
    // stops the app from quietly coming up on live data days after the last
    // time anyone chose that. The one exception is the restart a switch causes,
    // and it announces itself by leaving the marker below.
    let switch_path = app_data_dir.join(SWITCH_FILE);
    let switched = switch_path.is_file();
    if switched {
        let _ = fs::remove_file(&switch_path);
    } else if read_requested(app_data_dir) != DataMode::Local {
        let _ = fs::write(mode_path(app_data_dir), DataMode::Local.as_str());
    }

    let requested = read_requested(app_data_dir);
    let production_configured = env_path(app_data_dir, DataMode::Production).is_file();
    let fell_back = requested == DataMode::Production && !production_configured;
    let mode = if fell_back { DataMode::Local } else { requested };

    DataModeStatus {
        mode,
        requested,
        fell_back,
        production_configured,
        config_path: env_path(app_data_dir, mode).display().to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("selorson-mode-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("failed to create test directory");
        dir
    }

    #[test]
    fn an_unconfigured_app_starts_local() {
        let dir = temp_dir("fresh");
        let status = resolve(&dir);
        assert_eq!(status.mode, DataMode::Local);
        assert!(!status.fell_back);
        assert!(!status.production_configured);
    }

    #[test]
    fn production_is_refused_when_its_configuration_is_missing() {
        let dir = temp_dir("missing");
        write_requested(&dir, DataMode::Production).expect("failed to store mode");

        let status = resolve(&dir);
        assert_eq!(status.requested, DataMode::Production);
        assert_eq!(status.mode, DataMode::Local, "must not run production on local credentials");
        assert!(status.fell_back, "the fallback has to be visible, not silent");
    }

    #[test]
    fn production_is_honoured_once_its_configuration_exists() {
        let dir = temp_dir("configured");
        fs::write(env_path(&dir, DataMode::Production), "DATABASE_URL=postgres://x")
            .expect("failed to write configuration");
        write_requested(&dir, DataMode::Production).expect("failed to store mode");

        let status = resolve(&dir);
        assert_eq!(status.mode, DataMode::Production);
        assert!(!status.fell_back);
        assert!(status.config_path.ends_with(PRODUCTION_ENV_FILE));
    }

    #[test]
    fn a_damaged_mode_file_reads_as_local() {
        let dir = temp_dir("damaged");
        fs::write(mode_path(&dir), "prod").expect("failed to write mode file");
        assert_eq!(read_requested(&dir), DataMode::Local);
    }

    #[test]
    fn a_stored_choice_survives_a_round_trip() {
        let dir = temp_dir("roundtrip");
        write_requested(&dir, DataMode::Production).expect("failed to store mode");
        assert_eq!(read_requested(&dir), DataMode::Production);
        write_requested(&dir, DataMode::Local).expect("failed to store mode");
        assert_eq!(read_requested(&dir), DataMode::Local);
    }
}

#[cfg(test)]
mod startup_tests {
    use super::*;

    fn dir(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("selorson-start-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).expect("failed to create test directory");
        fs::write(env_path(&d, DataMode::Production), "DATABASE_URL=x").expect("write config");
        d
    }

    #[test]
    fn opening_the_app_always_starts_local() {
        let d = dir("fresh-open");
        fs::write(mode_path(&d), "production").expect("write mode");

        // No switch marker: this is someone opening the app, not a switch.
        assert_eq!(resolve(&d).mode, DataMode::Local);
        // And the stored choice is corrected, so the next read agrees.
        assert_eq!(read_requested(&d), DataMode::Local);
    }

    #[test]
    fn the_restart_a_switch_causes_keeps_the_chosen_mode() {
        let d = dir("switch");
        write_requested(&d, DataMode::Production).expect("store mode");

        assert_eq!(resolve(&d).mode, DataMode::Production);
    }

    #[test]
    fn the_marker_is_good_for_exactly_one_startup() {
        let d = dir("once");
        write_requested(&d, DataMode::Production).expect("store mode");

        assert_eq!(resolve(&d).mode, DataMode::Production, "the switch itself");
        assert_eq!(resolve(&d).mode, DataMode::Local, "reopening afterwards");
    }
}
