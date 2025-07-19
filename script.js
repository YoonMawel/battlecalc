const userSelect = document.getElementById('userSelect');
const monsterSelect = document.getElementById('monsterSelect');
const actionsContainer = document.getElementById('actionsContainer');
const resultDiv = document.getElementById('result');
const calcDetailsDiv = document.getElementById('calcDetails');

let users = [];
let monsters = [];
let currentMonsterHP;
let currentUserHPs = {};
let monsterAttackPower = 0;
let monsterDefensePower = 0;
let userAttackPowers = {};   // { "이름": 공격력 }
let userDefensePowers = {};  // { "이름": 방어력 }
let turn = 1;


// 유저 데이터 로드
fetch('users.json')
    .then(res => res.json())
    .then(data => {
        users = data;
        users.forEach((u, i) => {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = `${u.name} (공:${u.attack}, 방:${u.defense}, 행:${u.luck})`;
            userSelect.appendChild(option);
        });
    });

// 몬스터 데이터 로드
fetch('monsters.json')
    .then(res => res.json())
    .then(data => {
        monsters = data;
        monsters.forEach((m, i) => {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = `${m.name} (공:${m.power}, 방:${m.defense}, HP:${m.hp})`;
            monsterSelect.appendChild(option);
        });
    });

// 유저 선택 시 행동(공격/방어) 드롭다운 생성
const userDropdown = document.getElementById('userDropdown');
const selectedUsersDiv = document.getElementById('selectedUsers');
let selectedUsers = [];

function renderUserDropdown(filter = '') {
    userDropdown.innerHTML = '';
    users
        .filter(u => u.name.includes(filter))
        .forEach((u, i) => {
            const btn = document.createElement('button');
            btn.textContent = `${u.name} (공:${u.attack}, 방:${u.defense}, 행:${u.luck})`;
            btn.style.display = 'block';
            btn.onclick = () => selectUser(i);
            userDropdown.appendChild(btn);
        });
}

function selectUser(index) {
    if (selectedUsers.includes(index)) return;
    if (selectedUsers.length >= 6) {
        alert('최대 6명까지만 선택할 수 있습니다.');
        return;
    }
    selectedUsers.push(index);
    updateSelectedUsers();
}

function removeUser(index) {
    selectedUsers = selectedUsers.filter(i => i !== index);
    updateSelectedUsers();
}

function updateSelectedUsers() {
    selectedUsersDiv.textContent = `선택된 유저: (${selectedUsers.length}/6)`;
    selectedUsersDiv.innerHTML = `선택된 유저: (${selectedUsers.length}/6)<br>`;
    selectedUsers.forEach(i => {
        const u = users[i];
        const span = document.createElement('span');
        span.textContent = u.name + ' ';
        const removeBtn = document.createElement('button');
        removeBtn.textContent = '제거';
        removeBtn.onclick = () => removeUser(i);
        span.appendChild(removeBtn);
        selectedUsersDiv.appendChild(span);
    });

    renderActionSelectors();
}

function renderActionSelectors() {
    actionsContainer.innerHTML = '';
    selectedUsers.forEach(i => {
        const user = users[i];
        const div = document.createElement('div');
        div.textContent = `${user.name} 행동: `;

        const actionSelect = document.createElement('select');
        actionSelect.dataset.userIndex = i;
        ['attack', 'defense'].forEach(type => {
            const opt = document.createElement('option');
            opt.value = type;
            opt.textContent = type === 'attack' ? '공격' : '방어';
            actionSelect.appendChild(opt);
        });
        div.appendChild(actionSelect);
        actionsContainer.appendChild(div);
    });
}

// 유저 검색 기능
document.getElementById('userSearch').addEventListener('input', e => {
    renderUserDropdown(e.target.value);
});

// 유저 데이터 로드 후 드롭다운 초기 렌더링
fetch('users.json')
    .then(res => res.json())
    .then(data => {
        users = data;
        renderUserDropdown();
    });

document.getElementById('startBattleBtn').addEventListener('click', () => {
    const selectedMonster = monsters[monsterSelect.value];

    currentMonsterHP = selectedMonster.hp;

    currentUserHPs = {};
    selectedUsers.forEach(i => {
        const user = users[i];
        const baseHP = 100 + (user.hp * 10);
        currentUserHPs[user.name] = baseHP;
    });

    turn = 1;

    const startText =
        `[${selectedMonster.name}] 와 전투를 시작합니다.\n\n` +
        `[${selectedMonster.name}] 정보\n` +
        `체력 ${selectedMonster.hp} / 랜덤 1명 공격 / 그 외 불명\n\n` +
        `=== 전투 개시 ===`;

    // 출력
    resultDiv.innerHTML = startText.replace(/\n/g, '<br>');

    // 복사 버튼 추가
    const copyBtn = document.createElement('button');
    copyBtn.textContent = '복사하기';
    copyBtn.onclick = () => navigator.clipboard.writeText(startText);
    resultDiv.appendChild(copyBtn);

    document.getElementById('nextTurnBtn').disabled = false;
});

// 몬스터 행동 계산
document.getElementById('calculateMonsterBtn').addEventListener('click', () => {
    const selectedMonster = monsters[monsterSelect.value];
    const selectedUserObjs = selectedUsers.map(i => users[i]);
    const monsterAction = document.getElementById('monsterAction').value;

    document.getElementById('monsterResult').innerHTML = '';

    // 주사위 계산
    const monsterRoll = Math.floor(Math.random() * 15) + 1;  // 행운 판정용
    const monsterLuck = selectedMonster.luck || 0;
    const luckCheck = monsterRoll + monsterLuck;

    const attackRoll = Math.floor(Math.random() * 15) + 1;   // 전투력 계산용
    let totalPower = attackRoll + selectedMonster.power;

    let luckText = '';
    let resultText = '';

    // 행운 판정 결과 적용
    if (luckCheck <= 2) {
        luckText = `행운 판정 ${luckCheck}. 실패.`;
        currentMonsterHP -= totalPower;
        if (currentMonsterHP < 0) currentMonsterHP = 0;
        resultText = `${selectedMonster.name}이(가) 스스로 ${totalPower}만큼 피해를 입었습니다.`;

        monsterAttackPower = 0;
        monsterDefensePower = 0;
    } else if (luckCheck >= 14) {
        luckText = `행운 판정 ${luckCheck}. 대성공.`;
        totalPower += 15;

        if (monsterAction === 'attack' && selectedUserObjs.length > 0) {
            const randomIndex = Math.floor(Math.random() * selectedUserObjs.length);
            const targetUser = selectedUserObjs[randomIndex];
            currentUserHPs[targetUser.name] -= totalPower;
            if (currentUserHPs[targetUser.name] < 0) currentUserHPs[targetUser.name] = 0;
            resultText = `${selectedMonster.name}이(가) ${targetUser.name}을(를) ${totalPower}만큼 공격했습니다. (+15)`;

            monsterAttackPower = totalPower;
            monsterDefensePower = 0;
        } else {
            resultText = `${selectedMonster.name}이(가) 스스로 방어 태세를 취했습니다. (총 방어값: ${totalPower})`;

            monsterDefensePower = totalPower;
            monsterAttackPower = 0;
        }
    } else {
        luckText = `행운 판정 ${luckCheck}. 성공.`;
        if (monsterAction === 'attack' && selectedUserObjs.length > 0) {
            const randomIndex = Math.floor(Math.random() * selectedUserObjs.length);
            const targetUser = selectedUserObjs[randomIndex];
            currentUserHPs[targetUser.name] -= totalPower;
            if (currentUserHPs[targetUser.name] < 0) currentUserHPs[targetUser.name] = 0;
            resultText = `${selectedMonster.name}이(가) ${targetUser.name}을(를) ${totalPower}만큼 공격했습니다.`;

            monsterAttackPower = totalPower;
            monsterDefensePower = 0;
        } else {
            resultText = `${selectedMonster.name}이(가) 스스로 방어 태세를 취했습니다. (총 방어값: ${totalPower})`;

            monsterDefensePower = totalPower;
            monsterAttackPower = 0;
        }
    }

    // 최종 출력 텍스트
    const finalText = `${selectedMonster.name}, ${luckText}\n${resultText}`;

    // HTML 요소 구성 (문장 + 복사 버튼)
    const p = document.createElement('p');
    p.innerText = finalText;

    const copyBtn = document.createElement('button');
    copyBtn.textContent = '이 문장 복사';
    copyBtn.onclick = () => navigator.clipboard.writeText(finalText);

    p.appendChild(copyBtn);
    document.getElementById('monsterResult').appendChild(p);
});

// 유저 행동 계산 버튼
document.getElementById('calculateUsersBtn').addEventListener('click', () => {
    const selectedMonster = monsters[monsterSelect.value];
    const selectedUserObjs = selectedUsers.map(i => users[i]);
    const actionSelections = [...actionsContainer.querySelectorAll('select')];

    // 유저 결과는 monsterResult 밑에 출력하도록 변경
    const userResultContainer = document.createElement('div');
    userResultContainer.innerHTML = `<h4>유저 행동 결과</h4>`;
    let allResultText = '';
    calcDetailsDiv.innerHTML = '';  // 계산 과정만 초기화 (유저 행동 새로 표시할 때)

    selectedUserObjs.forEach((user, idx) => {
        const actionType = actionSelections[idx].value;
        const stat = actionType === 'attack' ? user.attack : user.defense;

        // 1) 행운 판정
        const luckRoll = Math.floor(Math.random() * 15) + 1;
        const luckCheck = luckRoll + user.luck;

        // 2) 전투력 계산
        const randomRoll = Math.floor(Math.random() * 15) + 1;
        let totalPower = user.luck + stat + randomRoll - selectedMonster.power;

        let targetName = selectedMonster.name;
        let luckText = '';
        let resultLine = '';

        // 3) 행운 판정 결과
        if (luckCheck <= 2) {
            luckText = `행운 판정 ${luckCheck}. 실패.`;
            const teammates = selectedUserObjs.filter(u => u.name !== user.name);
            if (teammates.length > 0) {
                const victim = teammates[Math.floor(Math.random() * teammates.length)];
                targetName = victim.name;
                currentUserHPs[victim.name] -= totalPower;
                if (currentUserHPs[victim.name] < 0) currentUserHPs[victim.name] = 0;
            }
            resultLine = `${targetName}에게 ${totalPower}만큼 피해를 줍니다.`;
        } else if (luckCheck >= 14) {
            luckText = `행운 판정 ${luckCheck}. 대성공.`;
            totalPower += 30; // +30 고정
            if (actionType === 'attack') {
                currentMonsterHP -= totalPower;
                if (currentMonsterHP < 0) currentMonsterHP = 0;
            }
            resultLine = `${targetName}에게 ${totalPower}만큼 공격합니다. (+30)`;
        } else {
            luckText = `행운 판정 ${luckCheck}. 성공.`;
            if (actionType === 'attack') {
                currentMonsterHP -= totalPower;
                if (currentMonsterHP < 0) currentMonsterHP = 0;
            }
            resultLine = `${targetName}에게 ${totalPower}만큼 ${actionType === 'attack' ? '공격' : '방어'}합니다.`;
        }

        const output = `${user.name}, ${luckText}\n${resultLine}`;
        allResultText += output + '\n\n';

        const p = document.createElement('p');
        p.className = 'result-line';
        p.innerText = output;

        const copyBtn = document.createElement('button');
        copyBtn.textContent = '이 줄 복사';
        copyBtn.onclick = () => navigator.clipboard.writeText(output);

        // 공격/방어 수치 저장 (턴 정산용)
        if (actionType === 'attack') {
            userAttackPowers[user.name] = totalPower;
            userDefensePowers[user.name] = 0;
        } else {
            userDefensePowers[user.name] = totalPower;
            userAttackPowers[user.name] = 0;
        }

        p.appendChild(copyBtn);
        userResultContainer.appendChild(p);

        const detail = `${user.name}: (행운 ${luckRoll}+${user.luck}=${luckCheck}), (스탯 계산: ${user.luck}+${stat}+주사위${randomRoll} - 몬스터공격 ${selectedMonster.power}) 최종 ${totalPower}`;
        calcDetailsDiv.innerHTML += detail + '<br>';
    });

    const copyBtnAll = document.createElement('button');
    copyBtnAll.textContent = '캐릭터 행동 결과 전체 복사';
    copyBtnAll.onclick = () => {
        navigator.clipboard.writeText(allResultText);
        alert('캐릭터 행동 결과가 복사되었습니다!');
    };
    userResultContainer.appendChild(copyBtnAll);

    // 유저 행동 결과 섹션을 몬스터 결과 밑에 붙임
    monsterResult.appendChild(userResultContainer);
});

// 계산 과정 토글
document.getElementById('toggleDetailsBtn').addEventListener('click', () => {
    calcDetailsDiv.style.display = calcDetailsDiv.style.display === 'none' ? 'block' : 'none';
});


//턴 정산 핸들러
document.getElementById('nextTurnBtn').addEventListener('click', () => {
    const selectedMonster = monsters[monsterSelect.value];  // 현재 몬스터 정보

    // 이번 턴 결과를 매번 새로 표시 (누적 X)
    resultDiv.innerHTML = `=== [턴 ${turn}] 정산 ===<br>`;

    // (1) 몬스터 → 유저 공격 (몬스터 공격력 vs 유저 방어력)
    if (monsterAttackPower > 0 && selectedUsers.length > 0) {
        const target = Object.keys(currentUserHPs).find(name => currentUserHPs[name] > 0);
        if (target) {
            const defense = userDefensePowers[target] || 0;
            let damage = monsterAttackPower - defense;
            if (damage < 0) damage = 0;

            currentUserHPs[target] -= damage;
            if (currentUserHPs[target] < 0) currentUserHPs[target] = 0;

            if (defense > 0) {
                resultDiv.innerHTML += `${selectedMonster.name}의 공격 → ${target} 방어값 ${defense}. 총 ${damage} 피해를 입었습니다.<br><br>`;
            } else {
                resultDiv.innerHTML += `${selectedMonster.name}의 공격 → ${target} 방어값 없음. ${damage} 피해를 입었습니다.<br><br>`;
            }
        }
    }

    // (2) 유저들 → 몬스터 공격 (유저 공격력 vs 몬스터 방어력)
    Object.entries(userAttackPowers).forEach(([name, atk]) => {
        if (atk > 0) {
            const defense = monsterDefensePower || 0;
            let damage = atk - defense;
            if (damage < 0) damage = 0;

            currentMonsterHP -= damage;
            if (currentMonsterHP < 0) currentMonsterHP = 0;

            if (defense > 0) {
                resultDiv.innerHTML += `${name}의 공격 → ${selectedMonster.name} 방어값 ${defense}. ${selectedMonster.name}가 총 ${damage}만큼의 피해를 받았습니다.<br>`;
            } else {
                resultDiv.innerHTML += `${name}의 공격 → ${selectedMonster.name} 방어값 없음. ${selectedMonster.name}가 총 ${damage}만큼의 피해를 받았습니다.<br>`;
            }
        }
    });

    // (3) 다음 턴 준비 (값 초기화)
    monsterAttackPower = 0;
    monsterDefensePower = 0;
    userAttackPowers = {};
    userDefensePowers = {};

    // (4) 현재 HP 출력 (몬스터와 유저)
    resultDiv.innerHTML += `<br>${selectedMonster.name} HP: ${currentMonsterHP}<br>`;
    for (const [name, hp] of Object.entries(currentUserHPs)) {
        resultDiv.innerHTML += `${name} HP: ${hp}<br>`;
    }

    // 턴 결과를 localStorage에 저장
    const log = localStorage.getItem('battleLogs') ? JSON.parse(localStorage.getItem('battleLogs')) : [];
    log.push({
        turn: turn,
        content: resultDiv.innerHTML,
        timestamp: new Date().toLocaleString()  // 날짜와 시간 기록
    });
    localStorage.setItem('battleLogs', JSON.stringify(log));

    // 현재 체력도 저장 (다음 전투에서 이어서 사용)
    localStorage.setItem('savedUserHPs', JSON.stringify(currentUserHPs));
    localStorage.setItem('savedMonsterHP', currentMonsterHP);

    turn++;
});

// 모바일 메뉴 토글 기능
const menuToggle = document.querySelector('.menu-toggle');
const menu = document.querySelector('.menu');

menuToggle.addEventListener('click', () => {
    menu.classList.toggle('open');
});


