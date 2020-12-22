const candidatesInput = document.querySelector('#candidates');
const ballotsInput = document.querySelector('#ballots');
const resultDiv = document.querySelector('#results');

const searchParams = new URLSearchParams(window.location.search);
candidatesInput.value = searchParams.get('c') || candidatesInput.value;
ballotsInput.value = searchParams.get('b') || ballotsInput.value;

function ok(value) {
    return { ok: true, value };
}

function err(value) {
    return { ok: false, value };
}

function run() {
    const sps = new URLSearchParams(window.location.search);
    sps.set('c', candidatesInput.value);
    sps.set('b', ballotsInput.value);
    const q = window.location.pathname + '?' + sps.toString();
    history.pushState(null, '', q);

    if (!candidatesInput.value || !ballotsInput.value) {
        resultDiv.innerHTML = '<p class="lead text-danger">Error: No candidates and ballots inputted.</p>';
        return;
    }

    const candidates = parseCandidates(candidatesInput.value);
    const ballots = parseBallots(candidates.length, ballotsInput.value);

    if (!ballots.ok) {
        let text = '<p class="lead text-danger">';
        for (const { reason, i } of ballots.value) {
            const msg = {
                nan: 'Input is not a sequence of numbers.',
                oob: 'Candidate number is out of bounds.',
                unique: 'Candidates must only appear once in ballot.'
            }[reason] ?? 'Unknown error.';
            text += `Ballot ${i + 1}: ${msg}<br>`;
        }

        text += '</p>';
        resultDiv.innerHTML = text;
        return;
    }

    const { rounds, final } = simulate(candidates, ballots.value);
    let text = '';
    for (let i = 0; i < rounds.length; i++) {
        text += `<h4>Round ${i + 1}</h4>`;
        text += formatRound(candidates, rounds[i]);
        text += '<hr>';
    }

    text += `<h4>Round ${rounds.length + 1}</h4>`;
    text += formatRound(candidates, final);
    text += '<hr>';
    text += `<h4 class="text-center">Winner: ${candidates[final.winner - 1]}</h4>`;

    resultDiv.innerHTML = text;
}

function formatRound(candidates, { tallies, total, exhausted, eliminated, winner, eliminatedSet }) {
    let text = '<div class="results-grid">';
    for (let i = 0; i < candidates.length; i++) {
        const candidate = candidates[i];
        const count = tallies.get(i + 1) ?? 0;
        const status = i + 1 === eliminated
            ? 'elim'
            : eliminatedSet.has(i + 1)
                ? 'out'
                : i + 1 === winner
                    ? 'win'
                    : 'normal';
        text += candidateName(candidate, status);
        text += progressBar(count, total, status);
    }

    text += `<span class="mt-3">${exhausted} ballots were exhausted.</span>`;
    text += '</div>';
    return text;
}

function candidateName(name, status) {
    const color = {
        elim: 'text-danger',
        win: 'text-success',
        out: 'text-muted',
        normal: 'text-light'
    }[status] ?? 'bg-primary';
    return `<div class="${color} pe-2">${escapeHtml(name)}</div>`;
}

function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function progressBar(count, total, status) {
    if (status === 'out') {
        return `
            <div class="progress bg-dark" style="height: 25px">
                <div class="progress-bar" style="width: 0%"></div>
            </div>
        `;
    }

    const pc = count / total * 100;
    const rpc = Math.round((pc + Number.EPSILON) * 100) / 100
    const color = {
        elim: 'bg-danger',
        win: 'bg-success',
        normal: 'bg-primary'
    }[status] ?? 'bg-primary';

    return `
        <div class="progress bg-dark" style="height: 25px">
            <div class="progress-bar ${color}" style="width: ${pc}%">${count} (${rpc}%)</div>
        </div>
    `;
}

function parseCandidates(input) {
    return input.split(/\n+/);
}

function parseBallots(numCandidates, input) {
    const lines = input.split(/\n+/);
    const ballots = [];
    const errors = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const ns = line.split(/\s+/).map(Number);

        let error;
        if (ns.some(n => isNaN(n))) {
            error = { reason: 'nan', i };
        } else if (ns.some(n => n <= 0 || n > numCandidates)) {
            error = { reason: 'oob', i };
        } else if (new Set(ns).size !== ns.length) {
            error = { reason: 'unique', i };
        }

        if (error) {
            errors.push(error);
        } else {
            ballots.push(ns);
        }
    }

    return errors.length ? err(errors) : ok(ballots);
}

function simulate(candidates, ballots) {
    const rounds = [];
    const eliminatedSet = new Set();
    let distributed = ballots;
    while (true) {
        const stage = simulateOne(candidates, eliminatedSet, distributed);
        if (stage.ok) {
            return { rounds, final: { ...stage.value, eliminatedSet: new Set(eliminatedSet) } };
        }

        distributed = distributed.map(ns => ns.filter(n => n !== stage.value.eliminated));
        rounds.push({ ...stage.value, eliminatedSet: new Set(eliminatedSet) });
        eliminatedSet.add(stage.value.eliminated);
    }
}

function simulateOne(candidates, eliminatedSet, ballots) {
    const tallies = new Map();
    for (let i = 0; i < candidates.length; i++) {
        if (!eliminatedSet.has(i + 1)) {
            tallies.set(i + 1, 0);
        }
    }

    let exhausted = 0;
    for (const ballot of ballots) {
        if (ballot.length === 0) {
            exhausted++;
            continue;
        }

        const i = ballot[0];
        tallies.set(i, (tallies.get(i) ?? 0) + 1);
    }

    let total = 0;
    let minimum = Infinity;
    for (const v of tallies.values()) {
        total += v;
        if (v < minimum) {
            minimum = v;
        }
    }

    for (const [k, v] of tallies.entries()) {
        if (v * 2 > total) {
            return ok({ tallies, total, exhausted, winner: k });
        }
    }

    let eliminated;
    for (const [k, v] of tallies.entries()) {
        if (v === minimum) {
            eliminated = k;
            break;
        }
    }

    return err({ tallies, total, exhausted, eliminated });
}
