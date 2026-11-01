//! A job owns the Windows shell and its descendants, including on app crash.
#[cfg(windows)]
pub struct ProcessJob(windows_sys::Win32::Foundation::HANDLE);

#[cfg(windows)]
unsafe impl Send for ProcessJob {}
#[cfg(windows)]
unsafe impl Sync for ProcessJob {}

#[cfg(windows)]
impl ProcessJob {
    pub fn attach(child: &dyn portable_pty::Child) -> Result<Self, String> {
        use windows_sys::Win32::System::JobObjects::*;
        // SAFETY: newly created handle is owned here; structures and child handle
        // remain valid for each call. Drop closes the owned handle exactly once.
        unsafe {
            let handle = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            if handle.is_null() {
                return Err("Cannot create terminal process job".into());
            }
            let job = Self(handle);
            let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            if SetInformationJobObject(
                handle,
                JobObjectExtendedLimitInformation,
                &limits as *const _ as *const _,
                std::mem::size_of_val(&limits) as u32,
            ) == 0
            {
                return Err("Cannot configure terminal process job".into());
            }
            let process = child
                .as_raw_handle()
                .ok_or("Missing shell process handle")?;
            if AssignProcessToJobObject(handle, process as _) == 0 {
                return Err("Cannot attach shell to terminal process job".into());
            }
            Ok(job)
        }
    }
}

#[cfg(windows)]
impl Drop for ProcessJob {
    fn drop(&mut self) {
        // SAFETY: this is the sole owner of a valid job handle.
        unsafe {
            windows_sys::Win32::Foundation::CloseHandle(self.0);
        }
    }
}

#[cfg(not(windows))]
pub struct ProcessJob;
#[cfg(not(windows))]
impl ProcessJob {
    pub fn attach(_: &dyn portable_pty::Child) -> Result<Self, String> {
        Ok(Self)
    }
}
