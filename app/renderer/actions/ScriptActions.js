import os from 'os';
import { spawn } from 'child_process';

import { showNotification } from './NotificationActions';
import * as ActionTypes from '../constants/ActionTypes';
import * as ScriptsUtils from '../utils/ScriptsUtils';

/**
 * We need to keep references to running process
 * so we can kill it on user request or receive
 * updates for console to append. Process is not
 * something we can serialize and keep in state,
 * so this is only way to do it.
 *
 * This variable contains project names as keys and
 * scripts names as sub-properties (like
 * `currentScripts.get('project-hash.task-name');`). Values
 * are `ChildProcess` objects.
 *
 * @type {Object}
 */
const runningScripts = new Map();

/**
 * @type {Boolean}
 */
const isWindows = os.platform() === 'win32';

/**
 * @param {Object} project
 * @param {Object} script
 * @return {Function}
 */
export function registerScript (project, script) {
	return (dispatch) => dispatch({
		type: ActionTypes.SCRIPT_REGISTER,
		payload: { project, script }
	});
}

/**
 * @param {Object} project
 * @param {Object} script
 * @return {Function}
 */
export function unregisterScript (project, script) {
	return (dispatch) => dispatch({
		type: ActionTypes.SCRIPT_UNREGISTER,
		payload: { project, script }
	});
}

/**
 * @param {Object} project
 * @param {Object} script
 * @return {Function}
 */
export function registerScriptStart (project, script) {
	return (dispatch) => dispatch({
		type: ActionTypes.SCRIPT_START,
		payload: { project, script }
	});
}

/**
 * @param {Object} project
 * @param {Object} script
 * @param {string} chunk
 * @return {Function}
 */
export function registerScriptDataChunk (project, script, chunk) {
	return (dispatch) => dispatch({
		type: ActionTypes.SCRIPT_RECEIVE_CHUNK,
		payload: { project, script, chunk }
	});
}

/**
 * @param {Object} project
 * @param {Object} script
 * @return {Function}
 */
export function registerScriptFinish (project, script) {
	return (dispatch) => dispatch({
		type: ActionTypes.SCRIPT_FINISH,
		payload: { project, script }
	});
}

/**
 * @param {Object} project
 * @param {Array<Object>} scripts
 * @return {Function}
 */
export function receiveScripts (project, scripts) {
	return (dispatch) => dispatch({
		type: ActionTypes.SCRIPTS_LOAD,
		payload: { project, scripts }
	});
}

/**
 * @param {Object} script
 * @return {Function}
 */
export function toggleOutput (script) {
	return (dispatch) => dispatch({
		type: ActionTypes.SCRIPT_TOGGLE_OUTPUT,
		payload: { script }
	});
}

/**
 * @param {Object} project
 * @return {Function}
 */
export function loadScripts (project) {
	return (dispatch) => {
		let scripts = ScriptsUtils.getScripts(project);

		// Filter scripts with empty commands
		scripts = scripts.filter(script =>
			script.command.trim().length > 0
		);

		dispatch(receiveScripts(project, scripts));
	};
}

/**
 * @param {Object} project
 * @param {Object} script
 * @return {Function}
 */
export function startScript (project, script) {
	return (dispatch) => {
		dispatch(registerScriptStart(project, script));

		const child = spawn(
			isWindows ? 'npm.cmd' : 'npm',
			[ 'run-script', '--no-color', script.name ],
			{
				shell: true,
				detached: !isWindows, // false on windows, true otherwise
				cwd: project.path
			}
		);

		refProcess(project, script, child);

		let stdout = '';
		let stderr = '';

		child.stdout.setEncoding('utf8');

		child.stdout.on('data', data => {
			if (data) {
				dispatch(registerScriptDataChunk(project, script, data.split(/\r?\n/)));
			}

			stdout += data;
		});

		child.stderr.on('data', data => {
			if (data && typeof data === 'string') {
				dispatch(registerScriptDataChunk(project, script, data.split(/\r?\n/)));
			}

			stderr += data;
		});

		child.on('exit', (code, signal) => { // eslint-disable-line consistent-return
			unrefProcess(project, script);

			const isStartScript = script.name === 'start';
			const projectName = project.data.name;

			// When process is finished successfully
			if (code === 0) {
				dispatch(registerScriptFinish(project, script, stdout));

				return isStartScript ?
					dispatch(showNotification(`${projectName} stopped`)) :
					dispatch(showNotification(`Task ${script.name} finished`, projectName));
			}

			// Then process is stopped by user
			if (signal === 'SIGTERM') {
				dispatch(registerScriptFinish(project, script));

				return isStartScript ?
					dispatch(showNotification(`${projectName} stopped`)) :
					dispatch(showNotification(`Task ${script.name} stopped`, projectName));
			}

			// Then process exited with error
			dispatch(registerScriptFinish(project, script, stdout));
			dispatch(showNotification(`Task ${script.name} failed`, projectName));
		});
	};
}

/**
 * @param {Object} project
 * @param {Object} script
 * @returns {Function}
 */
export function stopScript (project, script) {
	return () => {
		const child = runningScripts.get(`${project.code}.${script.name}`);

		if (isWindows) {
			child.kill('SIGTERM');
		} else {
			// If pid is less than -1, then sig is sent to every process
			// in the process group whose ID is -pid.
			process.kill(-child.pid, 'SIGTERM');
		}

		unrefProcess(project, script);
	};
}

/**
 * @param {Object} project
 * @param {Object} script
 * @param {Object} process
 */
function refProcess (project, script, process) {
	runningScripts.set(`${project.code}.${script.name}`, process);
}

/**
 * @param project
 * @param script
 */
function unrefProcess (project, script) {
	runningScripts.delete(`${project.code}.${script.name}`);
}