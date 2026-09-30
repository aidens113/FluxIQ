// Whether a pid is running on this machine. Signal 0 checks without sending:
// ESRCH means no such process; EPERM means it exists but belongs to someone
// else, which is still running.

/** @param {number} pid @returns {boolean} */
export function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    if (error?.code === "EPERM") return true;
    throw error;
  }
}
