// Run Tests: runs each suite, one Run Tests at a time, and writes each suite's scored results file
// from this run only. A candidate's own test runs never take the lock and never write a scored file.
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const LOCK_FILE = path.join(ROOT, ".cache/test-run.lock");
const TAKEOVER_FILE = `${LOCK_FILE}.takeover`;
// Each suite reports into this run's own file here. The files move to the scored paths only at the end.
const RUNS_DIR = path.join(ROOT, ".cache/test-runs");
const RUN_FILE_PATTERN = /^run-\d+-[\w-]+\.xml$/;
// One entry per suite, each with the scored file hackerrank.yml lists for it. `env` and `command` point the
// suite's reporter at this run's own file. TEST_RUN=scoring tells backend/conftest.py that this is Run Tests.
// `isFromFile` tells which test file a reported testcase came from: pytest puts the test's module in its
// classname, Vitest the file's path.
const SUITES = [
    {
        name: "Backend",
        cwd: "backend",
        command: (runFile) => [
            path.join(ROOT, ".venv/bin/python"),
            "-m",
            "pytest",
            `--junitxml=${runFile}`,
        ],
        env: () => ({ TEST_RUN: "scoring" }),
        scoredFile: "output/backend.xml",
        isFromFile: ({ classname }, testFile) => {
            const module = testFile
                .replace(/^backend\//, "")
                .replace(/\.py$/, "")
                .split("/")
                .join(".");
            return classname === module || classname.startsWith(`${module}.`);
        },
    },
    {
        name: "Frontend",
        cwd: "frontend",
        command: () => ["bun", "run", "test"],
        env: (runFile) => ({ VITEST_JUNIT_FILE: runFile }),
        scoredFile: "output/frontend.xml",
        isFromFile: ({ classname }, testFile) => `frontend/${classname}` === testFile,
    },
];
// Uploaded with a ticket's hidden tests, never part of the starter: every testcase that ticket's solution reports, per
// scored file. A hidden test file that fails to load on a candidate's code reports one error at most (pytest) or
// nothing at all, so HackerRank would never store or grade its tests. Each expected testcase this run didn't report
// is added to its scored file as a failed one, in place of pytest's one-line stand-in for that file.
const EXPECTED_FILE = path.join(ROOT, "scoring/expected-testcases.json");
const RECORD_EXPECTED_FLAG = "--record-expected";
const DID_NOT_RUN_MESSAGE = "did not run: its test file failed to load or compile on this code";
const ENDED_EARLY_MESSAGE =
    "the test process ended before it reported any results (candidate code that exits, a crash, or the Run Tests limit)";
const EMPTY_REPORT = '<?xml version="1.0" encoding="UTF-8"?>\n<testsuites>\n</testsuites>\n';
const XML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" };
const LOCK_POLL_MS = 1000;
// One limit for the whole Run Tests, time spent waiting for another run included.
const RUN_LIMIT_MS = 300_000;
const KILL_GRACE_MS = 10_000;
const GROUP_POLL_MS = 100;
const WATCHDOG_POLL_MS = 1000;
const WATCHDOG_FLAG = "--watchdog";
const FAILED_EXIT_CODE = 1;
const INTERRUPTED_EXIT_CODE = 130;

let activeSuite = null;
let isLockHeld = false;
let isInterrupted = false;
const isRecording = process.argv.includes(RECORD_EXPECTED_FLAG);
// With RECORD_EXPECTED_FLAG: the ticket's hidden test files, as paths from the repository root.
const recordedTestFiles = isRecording
    ? process.argv.slice(process.argv.indexOf(RECORD_EXPECTED_FLAG) + 1)
    : [];
const runDeadline = Date.now() + RUN_LIMIT_MS;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function pidAlive(pid) {
    try {
        process.kill(pid, 0);
        return true;
    } catch (err) {
        return err.code === "EPERM";
    }
}

function stopGroup(groupId, signal) {
    try {
        process.kill(-groupId, signal);
    } catch (err) {
        if (err.code !== "ESRCH") throw err;
    }
}

// The owner can free the lock between our failed create and this read. null means "try again".
function readLockOwner() {
    try {
        return fs.readFileSync(LOCK_FILE, "utf8").split(" ").map(Number);
    } catch (err) {
        if (err.code === "ENOENT") return null;
        throw err;
    }
}

// Only one waiting run at a time may clear a dead run's lock. Without this, two waiting runs can
// both clear it, and the second one deletes the lock the first one has just taken.
// Returns false when this run should wait and look again.
function clearDeadLock(deadPid, suiteGroup) {
    if (!tryTakeTakeover()) return false;
    try {
        const owner = readLockOwner();
        if (owner && owner[0] === deadPid) {
            // The previous run was killed before it could release the lock. Stop the suite it left
            // running, so two runs never write their results at the same time.
            if (suiteGroup) stopGroup(suiteGroup, "SIGKILL");
            fs.rmSync(LOCK_FILE, { force: true });
        }
        return true;
    } finally {
        fs.rmSync(TAKEOVER_FILE, { force: true });
    }
}

function tryTakeTakeover() {
    try {
        fs.writeFileSync(TAKEOVER_FILE, String(process.pid), { flag: "wx" });
        return true;
    } catch (err) {
        if (err.code !== "EEXIST") throw err;
    }
    // A run killed while it held the takeover lock leaves it behind. Clear it and look again next time.
    try {
        if (!pidAlive(Number(fs.readFileSync(TAKEOVER_FILE, "utf8"))))
            fs.rmSync(TAKEOVER_FILE, { force: true });
    } catch (err) {
        if (err.code !== "ENOENT") throw err;
    }
    return false;
}

function tryTakeLock() {
    try {
        fs.writeFileSync(LOCK_FILE, String(process.pid), { flag: "wx" });
        isLockHeld = true;
        return true;
    } catch (err) {
        if (err.code !== "EEXIST") throw err;
    }
    const owner = readLockOwner();
    if (!owner) return tryTakeLock();
    const [ownerPid, suiteGroup] = owner;
    if (pidAlive(ownerPid)) return false;
    if (!clearDeadLock(ownerPid, suiteGroup)) return false;
    return tryTakeLock();
}

// Returns false when the Run Tests limit passes before the other run frees the lock.
async function takeLock() {
    fs.mkdirSync(path.dirname(LOCK_FILE), { recursive: true });
    let isAnnounced = false;
    while (!tryTakeLock()) {
        if (Date.now() >= runDeadline) return false;
        if (!isAnnounced) {
            console.log("Waiting for another test run to finish...");
            isAnnounced = true;
        }
        await sleep(LOCK_POLL_MS);
    }
    return true;
}

function releaseLock() {
    try {
        if (Number(fs.readFileSync(LOCK_FILE, "utf8").split(" ")[0]) === process.pid)
            fs.rmSync(LOCK_FILE);
    } catch (err) {
        if (err.code !== "ENOENT") throw err;
    }
    isLockHeld = false;
}

// The suite's first process can exit before the ones it started (a forked test JVM). Wait for
// the whole group, so the next run never starts while this one is still shutting down.
async function waitForGroupExit(groupId) {
    const killAt = Date.now() + KILL_GRACE_MS;
    const giveUpAt = killAt + KILL_GRACE_MS;
    while (pidAlive(-groupId) && Date.now() < giveUpAt) {
        if (Date.now() >= killAt) stopGroup(groupId, "SIGKILL");
        await sleep(GROUP_POLL_MS);
    }
}

function stopSuite(suite, signal) {
    suite.isStopping = true;
    stopGroup(suite.pid, signal);
    setTimeout(() => stopGroup(suite.pid, "SIGKILL"), KILL_GRACE_MS).unref();
}

// The suite outlives this runner when the runner is killed outright (the IDE closing the Test
// terminal can do that), so a separate process watches it. It runs this same file with
// WATCHDOG_FLAG, in its own session, so nothing that stops the runner reaches it.
function startWatchdog(suiteGroup) {
    const args = [__filename, WATCHDOG_FLAG, process.pid, suiteGroup, runDeadline].map(String);
    const watchdog = spawn(process.execPath, args, { stdio: "ignore", detached: true });
    // Without a watchdog the run still works, as it did before there was one.
    watchdog.on("error", () => {});
    return watchdog;
}

// Waits for the watchdog to exit, so a finished run never leaves it behind.
function stopWatchdog(watchdog) {
    if (!watchdog.pid || watchdog.exitCode !== null || watchdog.signalCode !== null)
        return Promise.resolve();
    return new Promise((resolve) => {
        watchdog.once("exit", resolve);
        watchdog.kill();
    });
}

// Stops the suite's group when the runner is gone, or one poll after the run's limit (the runner
// stops it at the limit itself while it can, and says so). It signals only that group, and exits
// once the group is gone.
async function runWatchdog(runnerPid, suiteGroup, deadline) {
    if (!Number.isInteger(suiteGroup) || suiteGroup <= 1) return;
    // The runner is this process's parent, so a reused pid can't make a dead runner look alive.
    const isRunnerGone = () => process.ppid !== runnerPid || !pidAlive(runnerPid);
    while (pidAlive(-suiteGroup)) {
        if (isRunnerGone() || Date.now() >= deadline + WATCHDOG_POLL_MS) {
            stopGroup(suiteGroup, "SIGTERM");
            await waitForGroupExit(suiteGroup);
            return;
        }
        await sleep(WATCHDOG_POLL_MS);
    }
}

function runFileFor(index) {
    return path.join(RUNS_DIR, `run-${process.pid}-${index}.xml`);
}

// Each suite runs in its own process group, so a time-out or Ctrl+C also stops the test
// runner's own child processes (a forked JVM, Jest workers).
function runSuite(suite, runFile) {
    if (Date.now() >= runDeadline) {
        console.error(
            `${suite.name} tests did not start: Run Tests reached its ${RUN_LIMIT_MS / 60_000}-minute limit.`,
        );
        return Promise.resolve(FAILED_EXIT_CODE);
    }
    return new Promise((resolve) => {
        const [command, ...args] = suite.command(runFile);
        const child = spawn(command, args, {
            cwd: path.join(ROOT, suite.cwd),
            env: { ...process.env, ...(suite.env ? suite.env(runFile) : {}) },
            stdio: "inherit",
            detached: true,
        });
        activeSuite = child;
        fs.writeFileSync(LOCK_FILE, `${process.pid} ${child.pid}`);
        const watchdog = child.pid ? startWatchdog(child.pid) : null;
        const limit = setTimeout(() => {
            console.error(
                `${suite.name} tests were stopped at the ${RUN_LIMIT_MS / 60_000}-minute Run Tests limit.`,
            );
            stopSuite(child, "SIGTERM");
        }, runDeadline - Date.now());
        child.on("error", (err) => {
            console.error(`Could not start the ${suite.name} tests: ${err.message}`);
        });
        // A suite that never started, or was stopped by a signal, has no exit code of its own.
        child.on("close", async (code) => {
            clearTimeout(limit);
            if (child.isStopping) await waitForGroupExit(child.pid);
            if (watchdog) await stopWatchdog(watchdog);
            activeSuite = null;
            resolve(Number.isInteger(code) && code >= 0 ? code : FAILED_EXIT_CODE);
        });
    });
}

// Only the lock holder runs this, so every run file left here belongs to a killed run.
function removeLeftoverRunFiles() {
    for (const name of fs.readdirSync(RUNS_DIR)) {
        if (RUN_FILE_PATTERN.test(name)) fs.rmSync(path.join(RUNS_DIR, name), { force: true });
    }
}

// A suite whose test process ended before its reporter ran would leave no scored file, and HackerRank would score
// the other suites alone. One failed testcase stands in for all of its tests.
function endedEarlyReport(suite) {
    const name = `${suite.cwd} tests ended early`;
    const failure = `<failure type="EndedEarly" message="${escapeXml(ENDED_EARLY_MESSAGE)}"/>`;
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n<testsuites tests="1" failures="1" errors="0">\n' +
        `\t<testsuite name="${name}" tests="1" failures="1" errors="0" skipped="0" time="0">\n` +
        `\t\t<testcase classname="${suite.cwd}" name="${name}" time="0">${failure}</testcase>\n` +
        "\t</testsuite>\n</testsuites>\n"
    );
}

// Each scored file is renamed into place, so it never holds half of a run's results. Returns the suites that
// wrote no results: their test process ended before the reporter ran, even when it exited with 0.
function writeScoredFiles() {
    const suitesWithoutResults = [];
    for (const [index, suite] of SUITES.entries()) {
        const runFile = runFileFor(index);
        if (!fs.existsSync(runFile)) {
            suitesWithoutResults.push(suite.name);
            fs.writeFileSync(runFile, endedEarlyReport(suite));
        }
        fs.writeFileSync(runFile, withOneVerdictPerTest(fs.readFileSync(runFile, "utf8")));
        const scoredFile = path.join(ROOT, suite.scoredFile);
        fs.mkdirSync(path.dirname(scoredFile), { recursive: true });
        fs.renameSync(runFile, scoredFile);
    }
    return suitesWithoutResults;
}

const TESTCASE_ELEMENT = /<testcase\b[^>]*?(?:\/>|>[\s\S]*?<\/testcase>)\s*/g;
const isNotPassed = (element) => /<(failure|error)\b/.test(element);

const totalsOf = (elements) => ({
    tests: elements.length,
    failures: elements.filter((element) => /<failure\b/.test(element)).length,
    errors: elements.filter((element) => !/<failure\b/.test(element) && /<error\b/.test(element)).length,
});
const withTotals = (open, totals) =>
    open.replace(/\b(tests|failures|errors)="\d+"/g, (_, key) => `${key}="${totals[key]}"`);

// Counts each suite's totals, and the root's when the reporter writes them, again from the testcases left in them.
function withRecountedTotals(report) {
    const counted = report.replace(
        /(<testsuite\b[^>]*>)([\s\S]*?)(<\/testsuite>)/g,
        (suite, open, body, close) => withTotals(open, totalsOf(body.match(TESTCASE_ELEMENT) ?? [])) + body + close,
    );
    return counted.replace(/<testsuites\b[^>]*>/, (root) =>
        withTotals(root, totalsOf(counted.match(TESTCASE_ELEMENT) ?? [])),
    );
}

// pytest writes a test that fails and then errors in its teardown as two testcases with the same name, so one test
// would count twice. Each test keeps one testcase: the first one, or the first that did not pass.
function withOneVerdictPerTest(report) {
    let isChanged = false;
    const deduplicated = report.replace(
        /(<testsuite\b[^>]*>)([\s\S]*?)(<\/testsuite>)/g,
        (suite, open, body, close) => {
            const elements = body.match(TESTCASE_ELEMENT) ?? [];
            const kept = new Map();
            for (const element of elements) {
                const [, attributes] = element.match(/<testcase\b([^>]*?)\/?>/);
                const key = `${/\bclassname="([^"]*)"/.exec(attributes)?.[1]}\n${/\bname="([^"]*)"/.exec(attributes)?.[1]}`;
                if (!kept.has(key) || (isNotPassed(element) && !isNotPassed(kept.get(key)))) kept.set(key, element);
            }
            if (kept.size === elements.length) return suite;

            isChanged = true;
            let isFirst = true;
            const newBody = body.replace(TESTCASE_ELEMENT, () => {
                if (!isFirst) return "";
                isFirst = false;
                return [...kept.values()].join("");
            });
            return open + newBody + close;
        },
    );
    return isChanged ? withRecountedTotals(deduplicated) : report;
}

function escapeXml(text) {
    return text.replace(/[&<>"']/g, (char) => XML_ESCAPES[char]);
}

function unescapeXml(text) {
    return text.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (entity, code) => {
        if (code.startsWith("#x")) return String.fromCodePoint(parseInt(code.slice(2), 16));
        if (code.startsWith("#")) return String.fromCodePoint(Number(code.slice(1)));
        return Object.keys(XML_ESCAPES).find((char) => XML_ESCAPES[char] === entity);
    });
}

// Both reporters write one <testcase> per test, with its classname, name and test file as attributes.
function reportedTestcases(report) {
    return [...report.matchAll(/<testcase\b([^>]*?)\/?>/g)].map(([, attributes]) => {
        const values = Object.fromEntries(
            [...attributes.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, key, value]) => [
                key,
                unescapeXml(value),
            ]),
        );
        return { classname: values.classname ?? "", name: values.name ?? "", file: values.file ?? "" };
    });
}

function testcaseKey({ classname, name, file }) {
    return JSON.stringify([classname, name, file]);
}

function didNotRunSuite(testcases) {
    const failure = `<failure type="DidNotRun" message="${escapeXml(DID_NOT_RUN_MESSAGE)}"/>`;
    const cases = testcases.map(
        ({ classname, name, file }) =>
            `\t\t<testcase classname="${escapeXml(classname)}" name="${escapeXml(name)}" file="${escapeXml(file)}" time="0">${failure}</testcase>\n`,
    );

    return `\t<testsuite name="did not run" tests="${testcases.length}" failures="${testcases.length}" errors="0" skipped="0" time="0">\n${cases.join("")}\t</testsuite>\n`;
}

// A test file that fails to load is reported as one stand-in testcase: pytest leaves its classname empty and names it
// after the file's module, Vitest uses the file's path as both. Once that file's expected testcases are added as
// failed ones, the stand-in goes, so the file counts as many testcases as on the solution.
function withoutStandIns(report, missing) {
    return report.replace(
        /<testcase classname="([^"]*)" name="([^"]*)"[^>]*?(?:\/>|>[\s\S]*?<\/testcase>)\s*/g,
        (element, classname, name) => {
            const file = unescapeXml(name);
            const isStandIn = classname === "" || classname === name;
            const isReplaced =
                isStandIn &&
                missing.some((testcase) => testcase.classname === file || testcase.classname.startsWith(`${file}.`));
            return isReplaced ? "" : element;
        },
    );
}

// Adds the suite before the closing root tag, then counts the totals again.
function withDidNotRun(report, testcases) {
    const kept = withoutStandIns(report, testcases);
    const end = kept.lastIndexOf("</testsuites>");
    return withRecountedTotals(kept.slice(0, end) + didNotRunSuite(testcases) + kept.slice(end));
}

// Without a readable report (the suite crashed or was stopped first), every expected testcase of that file is missing.
// Returns how many testcases were added as failed.
function addTestsThatDidNotRun() {
    if (!fs.existsSync(EXPECTED_FILE)) return 0;

    const expected = JSON.parse(fs.readFileSync(EXPECTED_FILE, "utf8"));
    let addedCount = 0;

    for (const [index, suite] of SUITES.entries()) {
        const scoredFile = path.join(ROOT, suite.scoredFile);
        const existing = fs.existsSync(scoredFile) ? fs.readFileSync(scoredFile, "utf8") : "";
        const report = existing.includes("</testsuites>") ? existing : EMPTY_REPORT;
        const reported = new Set(reportedTestcases(report).map(testcaseKey));
        const missing = (expected[suite.scoredFile] ?? []).filter(
            (testcase) => !reported.has(testcaseKey(testcase)),
        );

        if (!missing.length) continue;
        // Written next to the run files and renamed into place, like the suites' own results.
        const runFile = runFileFor(`expected-${index}`);
        fs.writeFileSync(runFile, withDidNotRun(report, missing));
        fs.mkdirSync(path.dirname(scoredFile), { recursive: true });
        fs.renameSync(runFile, scoredFile);
        console.error(
            `${suite.name}: ${missing.length} expected test(s) did not run, so they count as failed.`,
        );
        addedCount += missing.length;
    }

    return addedCount;
}

// For the question's author, on a ticket's solution branch after a change to its hidden tests: lists the testcases this
// run reported from the named hidden test files only. A visible test is never listed, so a visible test the solution
// renames can't count as "did not run" for every candidate. Keep the file on solution-prod as
// scoring/<ticket>/expected-testcases.json and upload it with that ticket's hidden tests as scoring/expected-testcases.json.
function recordExpectedTestcases() {
    if (!recordedTestFiles.length) {
        console.error(
            `Name the ticket's hidden test files after ${RECORD_EXPECTED_FLAG}, for example backend/tests/test_orders.py.`,
        );
        return false;
    }

    const expected = {};
    const counts = new Map(recordedTestFiles.map((testFile) => [testFile, 0]));

    for (const suite of SUITES) {
        const scoredFile = path.join(ROOT, suite.scoredFile);
        const reported = fs.existsSync(scoredFile)
            ? reportedTestcases(fs.readFileSync(scoredFile, "utf8"))
            : [];
        const hidden = reported.filter((testcase) => {
            const testFile = recordedTestFiles.find((file) => suite.isFromFile(testcase, file));
            if (testFile) counts.set(testFile, counts.get(testFile) + 1);
            return Boolean(testFile);
        });

        if (hidden.length) expected[suite.scoredFile] = hidden;
    }

    for (const [testFile, count] of counts) console.log(`${testFile}: ${count} testcases`);

    fs.mkdirSync(path.dirname(EXPECTED_FILE), { recursive: true });
    fs.writeFileSync(EXPECTED_FILE, `${JSON.stringify(expected, null, "\t")}\n`);
    console.log(
        `Wrote ${Object.values(expected).flat().length} expected testcases to ${path.relative(ROOT, EXPECTED_FILE)}.`,
    );
    return true;
}

// Ctrl+C only asks the suite to stop. main() frees the lock once the suite has really stopped.
function onInterrupt(signal) {
    if (!isLockHeld) process.exit(INTERRUPTED_EXIT_CODE);
    isInterrupted = true;
    if (activeSuite) stopSuite(activeSuite, signal);
}

async function main() {
    process.on("SIGINT", onInterrupt);
    process.on("SIGTERM", onInterrupt);
    // The IDE closing the Test terminal sends SIGHUP. Stop the suite as for SIGTERM.
    process.on("SIGHUP", () => onInterrupt("SIGTERM"));
    if (!(await takeLock())) {
        console.error(
            `Stopped waiting: another test run held the lock for the whole ${RUN_LIMIT_MS / 60_000}-minute Run Tests limit. Run Tests again.`,
        );
        process.exitCode = FAILED_EXIT_CODE;
        return;
    }
    try {
        fs.mkdirSync(RUNS_DIR, { recursive: true });
        for (const suite of SUITES) fs.rmSync(path.join(ROOT, suite.scoredFile), { force: true });
        removeLeftoverRunFiles();
        const exitCodes = [];
        for (const [index, suite] of SUITES.entries()) {
            if (isInterrupted) break;
            exitCodes.push(await runSuite(suite, runFileFor(index)));
        }
        if (isInterrupted) {
            removeLeftoverRunFiles();
            process.exitCode = INTERRUPTED_EXIT_CODE;
            return;
        }
        const suitesWithoutResults = writeScoredFiles();
        for (const name of suitesWithoutResults) {
            console.error(
                `${name} tests wrote no results: the test process ended before it could report them, so they count as one failed test.`,
            );
        }
        const isPassed = exitCodes.every((code) => code === 0) && !suitesWithoutResults.length;

        if (isRecording) {
            if (!isPassed)
                console.error(
                    "Expected testcases not recorded: record them from a run where every test passes.",
                );
            process.exitCode = isPassed && recordExpectedTestcases() ? 0 : FAILED_EXIT_CODE;
            return;
        }

        const didNotRunCount = addTestsThatDidNotRun();
        process.exitCode = isPassed && didNotRunCount === 0 ? 0 : FAILED_EXIT_CODE;
    } finally {
        releaseLock();
    }
}

if (process.argv[2] === WATCHDOG_FLAG) {
    runWatchdog(...process.argv.slice(3).map(Number));
} else {
    main();
}
