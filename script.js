const monsterSelect = document.getElementById('monsterSelect');
const actionsContainer = document.getElementById('actionsContainer');
const resultDiv = document.getElementById('result');
const calcDetailsDiv = document.getElementById('calcDetails');
const monsterResultDisplay = document.getElementById('monsterResultDisplay'); // ★★★ 이 줄
const userResultDisplay = document.getElementById('userResultDisplay');     // ★★★ 이 줄

let users = [];
let monsters = [];
let currentMonsterHP;
let currentUserHPs = {};
let monsterAttackPower = 0;
let monsterDefensePower = 0;
let userAttackPowers = {};  // { "이름": 공격력 }
let userDefensePowers = {};  // { "이름": 방어력 }
let turn = 1;
let monsterTarget = null;
let monsterHits = {};  // 턴마다 몬스터가 누구 때렸는지 기록
let userActions = {};  // { "유저명": "attack" 또는 "defense" }


// 몬스터 데이터 로드 (기존과 동일)
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
        .map((u, idx) => ({ ...u, realIndex: idx }))  // 실제 인덱스 보존
        .filter(u => u.name.includes(filter))
        .forEach((u, i) => {
            const btn = document.createElement('button');
            btn.textContent = `${u.name} (공:${u.attack}, 방:${u.defense}, 행:${u.luck})`;
            btn.style.display = 'block';
            btn.onclick = () => selectUser(u.realIndex);
            userDropdown.appendChild(btn);
        });
}

function renderHPManager() {
    const hpControls = document.getElementById('hpControls');
    hpControls.innerHTML = '';

    Object.keys(currentUserHPs).forEach(name => {
        const container = document.createElement('div');
        container.style.marginBottom = '8px';

        const label = document.createElement('span');
        label.textContent = `${name} HP: ${currentUserHPs[name]} `;

        // +10 버튼
        const incBtn = document.createElement('button');
        incBtn.textContent = '+10';
        incBtn.onclick = () => {
            currentUserHPs[name] += 10;
            label.textContent = `${name} HP: ${currentUserHPs[name]}`;
            localStorage.setItem('savedUserHPs', JSON.stringify(currentUserHPs));
        };

        // -10 버튼
        const decBtn = document.createElement('button');
        decBtn.textContent = '-10';
        decBtn.onclick = () => {
            currentUserHPs[name] -= 10;
            if (currentUserHPs[name] < 0) currentUserHPs[name] = 0;
            label.textContent = `${name} HP: ${currentUserHPs[name]}`;
            localStorage.setItem('savedUserHPs', JSON.stringify(currentUserHPs));
        };

        // 풀회복 버튼 (개별 유저)
        const healBtn = document.createElement('button');
        healBtn.textContent = '풀회복';
        healBtn.onclick = () => {
            const user = users.find(u => u.name === name);
            // 기본 HP를 100으로 가정 (user.hp * 10 부분이 없어서 임시로 100+a)
            const maxHP = 100 + (user ? (user.hp * 10) : 0); // user.hp가 기본 스탯이므로, 적절히 스케일링
            currentUserHPs[name] = maxHP;
            label.textContent = `${name} HP: ${currentUserHPs[name]}`;
            localStorage.setItem('savedUserHPs', JSON.stringify(currentUserHPs));
        };

        container.appendChild(label);
        container.appendChild(incBtn);
        container.appendChild(decBtn);
        container.appendChild(healBtn);
        hpControls.appendChild(container);
    });
}

document.getElementById('saveHPBtn').addEventListener('click', () => {
    localStorage.setItem('savedUserHPs', JSON.stringify(currentUserHPs));
    alert('체력이 저장되었습니다.');
});

// 체력 UI 수동 갱신 버튼
document.getElementById('refreshHPBtn').addEventListener('click', () => {
    renderHPManager();
    alert('체력 UI가 갱신되었습니다.');
});

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
    // 유저 제거 시 해당 유저의 userActions 및 HP 정보도 제거
    const user = users[index];
    if (user && user.name) {
        delete userActions[user.name];
        delete currentUserHPs[user.name];
    }
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

        // 드롭다운 변경 시 선택값 기록 및 콘솔 로그 출력
        actionSelect.addEventListener('change', () => {
            userActions[user.name] = actionSelect.value;
            // 디버그: 유저 행동 드롭다운이 변경될 때마다 콘솔에 출력
            console.log(`디버그: [${user.name}]의 행동이 [${actionSelect.value}]로 변경됨. 현재 userActions 상태:`, userActions);
        });

        // 유저가 이전에 선택한 액션이 있다면 그 값으로 드롭다운을 초기화
        if (userActions[user.name]) {
            actionSelect.value = userActions[user.name];
            // 디버그: 유저 행동 드롭다운이 초기화될 때 콘솔에 출력
            console.log(`디버그: [${user.name}]의 드롭다운 초기화 값: [${userActions[user.name]}]`);
        }

        div.appendChild(actionSelect);
        actionsContainer.appendChild(div);
    });
}

// 유저 검색 기능
document.getElementById('userSearch').addEventListener('input', e => {
    renderUserDropdown(e.target.value);
});

fetch('users.json')
    .then(res => res.json())
    .then(data => {
        users = data;
        renderUserDropdown(); // 유저 검색 드롭다운 초기 렌더링
    });

document.getElementById('startBattleBtn').addEventListener('click', () => {
    const selectedMonster = monsters[monsterSelect.value];

    // userActions는 전투 시작 시 초기화하지 않습니다. (사용자 선택 유지)
    userAttackPowers = {};
    userDefensePowers = {};

    // 저장된 체력 불러오기 (있으면 이어서 사용)
    const savedUserHPs = JSON.parse(localStorage.getItem('savedUserHPs') || '{}');
    const savedMonsterHP = localStorage.getItem('savedMonsterHP');

    currentUserHPs = {};  // 항상 먼저 초기화 (중복 데이터 방지)

    // 몬스터 HP 초기화 (NaN 방지: 유효한 숫자만 반영)
    if (savedMonsterHP !== null && !isNaN(parseInt(savedMonsterHP, 10))) {
        currentMonsterHP = parseInt(savedMonsterHP, 10);
    } else {
        currentMonsterHP = selectedMonster.hp;  // 저장된 값 없으면 기본 HP 사용
    }

    // 유저 HP 로드
    selectedUsers.forEach(i => {
        const user = users[i];
        // user.hp는 기본 스탯이므로, 게임 내 최대 HP는 100 + (user.hp * 10) 등으로 계산
        const baseHP = 100 + (user.hp * 10);
        const hp = savedUserHPs.hasOwnProperty(user.name) ? parseInt(savedUserHPs[user.name], 10) : baseHP;
        currentUserHPs[user.name] = isNaN(hp) ? baseHP : hp; // 유효하지 않으면 기본 HP 사용
    });


    turn = 1;

    const startText =
        `[${selectedMonster.name}] 와 전투를 시작합니다.\n\n` +
        `[${selectedMonster.name}] 정보\n` +
        `체력 ${currentMonsterHP} / 랜덤 1명 공격 / 그 외 불명\n\n` +
        `=== 전투 개시 ===`;

    resultDiv.innerHTML = startText.replace(/\n/g, '<br>');

    const copyBtn = document.createElement('button');
    copyBtn.textContent = '복사하기';
    copyBtn.onclick = () => navigator.clipboard.writeText(startText);
    resultDiv.appendChild(copyBtn);

    renderHPManager();  // 체력 조정 UI 갱신

    document.getElementById('nextTurnBtn').disabled = false;
});

// script.js 파일에서 calculateMonsterBtn 이벤트 리스너를 찾아 이 부분을 수정합니다.

document.getElementById('calculateMonsterBtn').addEventListener('click', () => {
    const selectedMonster = monsters[monsterSelect.value];
    const selectedUserObjs = selectedUsers.map(i => users[i]);

    // 이전 디버그 메시지였던 '디버그: calculateMonsterBtn 시작 시 최종 userActions' 관련 로직도 제거합니다.
    // 몬스터 계산 시점에는 유저 액션을 강제 동기화할 필요가 없습니다.

    const monsterAction = document.getElementById('monsterAction').value;

    console.log('--- 몬스터 행동 디버깅 시작 ---');
    console.log('1. 몬스터 행동 드롭다운에서 가져온 값 (monsterAction):', monsterAction);
    console.log('2. 선택된 유저가 있는지 (selectedUserObjs.length > 0)?:', selectedUserObjs.length > 0);
    console.log('3. 선택된 유저 수 (selectedUserObjs.length):', selectedUserObjs.length);

    monsterResultDisplay.innerHTML = ''; // 몬스터 결과 섹션 초기화

    const monsterRoll = Math.floor(Math.random() * 15) + 1;
    const monsterLuck = selectedMonster.luck || 0;
    const luckCheck = monsterRoll + monsterLuck;
    const attackRoll = Math.floor(Math.random() * 15) + 1;
    let totalPower = attackRoll + selectedMonster.power; // 몬스터의 총 공격력 (잠재적 피해량)

    let luckText = '';
    let resultText = '';

    console.log('4. 몬스터 행운 판정 결과 (luckCheck):', luckCheck);

    // 몬스터가 스스로 피해 입는 경우
    if (luckCheck <= 2) {
        luckText = `행운 판정 ${luckCheck}. 실패.`;
        currentMonsterHP -= totalPower; // 즉시 피해 적용 (몬스터 HP)
        if (currentMonsterHP < 0) currentMonsterHP = 0;
        resultText = `${selectedMonster.name}이(가) 스스로 ${totalPower}만큼 피해를 입었습니다.`;

        monsterAttackPower = 0;
        monsterDefensePower = 0;
        monsterTarget = null;
        monsterHits = {}; // 몬스터가 유저를 공격하지 않으므로 비워둡니다.

        console.log('5. 실행된 로직: 몬스터 스스로 피해 (luckCheck <= 2)');

    } else if (monsterAction === 'attack' && selectedUserObjs.length > 0) { // 몬스터가 유저 공격
        const randomIndex = Math.floor(Math.random() * selectedUserObjs.length);
        const targetUser = selectedUserObjs[randomIndex]; // 몬스터의 공격 대상 유저

        monsterTarget = targetUser.name; // 몬스터의 공격 대상 기록

        // ★★★ 여기! monsterHits에 몬스터의 '공격력'만 저장합니다.
        // 유저의 방어 여부나 최종 피해량은 아직 계산하지 않습니다.
        monsterHits[targetUser.name] = {
            monsterPureAttackPower: totalPower, // 몬스터가 이 유저에게 가할 '순수' 공격력 값
            monsterLuckCheck: luckCheck // 몬스터의 행운 판정 결과 (필요하다면)
        };

        luckText = `행운 판정 ${luckCheck}. ` + (luckCheck >= 14 ? '대성공.' : '성공.');
        // 몬스터가 누구를 공격할지 "선택했다"는 메시지만 출력
        resultText = `${selectedMonster.name}이(가) ${targetUser.name}을(를) 공격 대상으로 선택했습니다.` +
            (luckCheck >= 14 ? ' (몬스터 대성공!)' : '');

        // monsterAttackPower는 몬스터의 고유 스탯과 주사위 합이므로, 기록.
        monsterAttackPower = totalPower; // 몬스터 자체의 공격력을 기록
        monsterDefensePower = 0; // 몬스터가 공격했으니 방어력은 0

        console.log('5. 실행된 로직: 몬스터가 유저 공격 대상을 지정');

    } else { // 몬스터가 방어 선택
        luckText = `행운 판정 ${luckCheck}. ` + (luckCheck >= 14 ? '대성공.' : '성공.');
        resultText = `${selectedMonster.name}이(가) 스스로 방어 태세를 취했습니다. (총 방어값: ${totalPower})` +
                     (luckCheck >= 14 ? ' (+15 보너스)' : '');

        monsterDefensePower = totalPower; // 몬스터가 방어했으니 방어력 기록
        monsterAttackPower = 0;
        monsterTarget = null;
        monsterHits = {}; // 몬스터가 유저를 공격하지 않으므로 비워둡니다.

        console.log('5. 실행된 로직: 몬스터 방어 (기타 상황)');
    }

    console.log('--- 몬스터 행동 디버깅 끝 ---');

    // 최종 출력 텍스트 (몬스터 행동 결과만)
    const finalText = `${selectedMonster.name}, ${luckText}\n${resultText}`;
    const p = document.createElement('p');
    p.innerText = finalText;
    const copyBtn = document.createElement('button');
    copyBtn.textContent = '이 문장 복사';
    copyBtn.onclick = () => navigator.clipboard.writeText(finalText);
    p.appendChild(copyBtn);
    monsterResultDisplay.appendChild(p); // 몬스터 결과는 여기에 출력
});

document.getElementById('calculateUsersBtn').addEventListener('click', () => {
    const selectedMonster = monsters[monsterSelect.value];
    const selectedUserObjs = selectedUsers.map(i => users[i]);

    // ★★★ 가장 중요: '캐릭터 행동 결과'를 담당하는 userResultDisplay를 초기화합니다.
    userResultDisplay.innerHTML = '';
    // '유저 행동 결과' 제목을 userResultDisplay에 바로 추가합니다.
    userResultDisplay.innerHTML += `<h4>유저 행동 결과</h4>`; // 기존 내용을 덮어쓰지 않도록 += 사용

    let allResultText = ''; // 전체 결과를 복사하기 위한 텍스트 변수
    calcDetailsDiv.innerHTML = ''; // 계산 과정 상세 정보는 매번 초기화

    // 선택된 각 유저에 대한 행동 결과를 계산하고 표시합니다.
    selectedUserObjs.forEach((user, idx) => {
        // 해당 유저의 행동 타입(공격/방어)을 userActions에서 가져옵니다.
        // userActions 객체는 UI 드롭다운 변경 시 업데이트되므로, 최신 값이 여기에 있을 것으로 가정합니다.
        const actionType = userActions[user.name] || 'attack'; // userActions에 값이 없으면 기본 'attack'

        // 이 시점에서 userActions의 값을 다시 한번 콘솔에 찍어봅니다.
        console.log(`디버그: [calculateUsersBtn] 유저 [${user.name}]의 행동: [${actionType}]`);

        const stat = actionType === 'attack' ? user.attack : user.defense;

        // 1) 행운 판정
        const luckRoll = Math.floor(Math.random() * 15) + 1;
        const luckCheck = luckRoll + user.luck;

        // 2) 전투력 계산
        const randomRoll = Math.floor(Math.random() * 15) + 1;
        let potentialPower = user.luck + stat + randomRoll;

        let targetName = selectedMonster.name; // 유저의 공격 대상은 기본적으로 몬스터
        let luckText = '';
        let resultLine = '';

        // 3) 행운 판정 결과에 따른 메시지 및 로직
        if (luckCheck <= 2) {
            luckText = `행운 판정 ${luckCheck}. 실패.`;
            // 팀원에게 피해 입히는 로직은 여기에 그대로 둡니다.
            const teammates = selectedUserObjs.filter(u => u.name !== user.name);
            if (teammates.length > 0) {
                const victim = teammates[Math.floor(Math.random() * teammates.length)];
                targetName = victim.name;
                // 피해는 나중에 'nextTurnBtn'에서 최종 정산될 수 있도록 임시 저장하거나,
                // 이 시점에서 유저 HP에 직접 적용해도 무방합니다 (자가 피해이므로).
                currentUserHPs[victim.name] -= potentialPower;
                if (currentUserHPs[victim.name] < 0) currentUserHPs[victim.name] = 0;
            }
            resultLine = `${user.name}이(가) ${targetName}에게 ${potentialPower}만큼 피해를 줍니다. (아군 오사)`;
        } else if (luckCheck >= 14) {
            luckText = `행운 판정 ${luckCheck}. 대성공.`;
            potentialPower += 30; // 대성공 보너스
            resultLine = `${user.name}이(가) ${targetName}에게 ${potentialPower}만큼 ${actionType === 'attack' ? '공격' : '방어'}합니다. (+30)`;
        } else {
            luckText = `행운 판정 ${luckCheck}. 성공.`;
            resultLine = `${user.name}이(가) ${targetName}에게 ${potentialPower}만큼 ${actionType === 'attack' ? '공격' : '방어'}합니다.`;
        }

        // 결과 텍스트를 구성하고 전체 복사용 텍스트에 추가
        const output = `${user.name}, ${luckText}\n${resultLine}`;
        allResultText += output + '\n\n';

        // HTML에 표시할 <p> 요소 생성
        const p = document.createElement('p');
        p.className = 'result-line'; // CSS 스타일링을 위해 클래스 추가
        p.innerText = output;

        // 각 결과 문장 옆에 복사 버튼 추가
        const copyBtn = document.createElement('button');
        copyBtn.textContent = '이 줄 복사';
        copyBtn.onclick = () => navigator.clipboard.writeText(output);
        p.appendChild(copyBtn);

        // ★ 생성된 <p> 요소를 userResultDisplay에 바로 추가합니다.
        userResultDisplay.appendChild(p);

        // 계산 과정 상세 정보를 calcDetailsDiv에 추가
        const detail = `${user.name}: (행운 ${luckRoll}+${user.luck}=${luckCheck}), (기본 스탯+주사위: ${stat}+행운${user.luck}+주사위${randomRoll}) 최종 ${potentialPower}`;
        calcDetailsDiv.innerHTML += detail + '<br>';

        // 턴 정산을 위한 유저 공격/방어력 값을 저장 (이전과 동일)
        if (actionType === 'attack') {
            userAttackPowers[user.name] = potentialPower;
            userDefensePowers[user.name] = 0;
        } else {
            userDefensePowers[user.name] = potentialPower;
            userAttackPowers[user.name] = 0;
        }
    });

    // 모든 유저 결과 아래에 전체 복사 버튼 추가
    const copyBtnAll = document.createElement('button');
    copyBtnAll.textContent = '캐릭터 행동 결과 전체 복사';
    copyBtnAll.onclick = () => {
        navigator.clipboard.writeText(allResultText);
        alert('캐릭터 행동 결과가 복사되었습니다!');
    };
    // ★ '캐릭터 행동 결과 전체 복사' 버튼도 userResultDisplay에 추가합니다.
    userResultDisplay.appendChild(copyBtnAll);

    // HP 관리 UI 갱신 (선택 사항)
    renderHPManager();
});

//턴 정산 핸들러
document.getElementById('nextTurnBtn').addEventListener('click', () => {
    console.log('--- nextTurnBtn 디버깅 시작 ---');
    console.log('현재 userActions 상태:', userActions); // '허일서': 'defense'로 찍혀야 함.
    console.log('현재 monsterHits 상태:', monsterHits); // '허일서': { monsterPureAttackPower: '숫자', monsterLuckCheck: '숫자' }로 찍혀야 함.
    console.log('현재 userAttackPowers 상태:', userAttackPowers); // 유저 공격력 확인
    console.log('현재 userDefensePowers 상태:', userDefensePowers); // 유저 방어력 확인
    console.log('--- nextTurnBtn 디버깅 끝 ---');

    const selectedMonster = monsters[monsterSelect.value];
    resultDiv.innerHTML = `=== [턴 ${turn}] 정산 ===<br>`;

    // (1) 몬스터 → 유저 공격 정산
    if (Object.keys(monsterHits).length > 0) {
        Object.entries(monsterHits).forEach(([targetName, info]) => {
            // ★★★ 여기서 monsterPureAttackPower를 info에서 제대로 가져와야 합니다.
            const { monsterPureAttackPower } = info; // 새로운 이름으로 구조 분해 할당!

            const targetUser = users.find(u => u.name === targetName);

            if (targetUser) {
                let userEffectiveDefense = 0;
                // 이 시점에서 userActions의 값을 최종적으로 확인합니다.
                const targetUserAction = userActions[targetUser.name];

                console.log(`정산 디버그: [${targetUser.name}]의 턴 정산 시 행동: [${targetUserAction}]`);

                // 유저의 방어력 계산
                if (targetUserAction === 'defense') {
                    // calculateUsersBtn에서 계산된 최종 방어력 사용
                    userEffectiveDefense = userDefensePowers[targetUser.name] || 0;
                    console.log(`정산 디버그: [${targetUser.name}]의 행동은 [defense]이며, 적용될 방어력은: ${userEffectiveDefense}`);
                } else {
                    console.log(`정산 디버그: [${targetUser.name}]의 행동은 [${targetUserAction}]이므로 방어력 0.`);
                }

                // ★★★ 최종 피해 계산: 몬스터의 순수 공격력 - 유저의 유효 방어력
                const finalDamage = Math.max(monsterPureAttackPower - userEffectiveDefense, 0);

                currentUserHPs[targetUser.name] -= finalDamage;
                if (currentUserHPs[targetUser.name] < 0) currentUserHPs[targetUser.name] = 0;

                resultDiv.innerHTML += `${selectedMonster.name}의 공격(${monsterPureAttackPower}) → ${targetName} ` +
                    (userEffectiveDefense > 0 ? `(방어 ${userEffectiveDefense}) ` : '(방어 안 함) ') +
                    `${finalDamage} 피해! 현재 HP: ${currentUserHPs[targetName]}<br>`;
            }
        });
    } else {
        resultDiv.innerHTML += `${selectedMonster.name}은(는) 이번 턴에 유저를 공격하지 않았습니다.<br>`;
    }

    // 정산 후 몬스터 관련 기록 초기화 (이전과 동일)
    monsterHits = {};
    monsterAttackPower = 0;
    monsterDefensePower = 0;
    monsterTarget = null;

    resultDiv.innerHTML += `<br>--- 유저의 행동 ---<br>`;

    // (2) 유저들 → 몬스터 공격 정산
    if (Object.keys(userAttackPowers).length > 0) {
        Object.entries(userAttackPowers).forEach(([name, atk]) => {
            if (atk > 0) { // 공격 행동을 한 유저만 처리
                let monsterEffectiveDefense = 0;
                // 몬스터가 이번 턴에 'defense' 행동을 했는지 확인
                // monsterDefensePower는 calculateMonsterBtn에서 몬스터가 방어 행동을 했을 때만 0보다 큰 값이 됩니다.
                if (monsterDefensePower > 0) {
                    monsterEffectiveDefense = monsterDefensePower;
                } else { // 몬스터가 '공격' 행동을 했거나, 스스로 피해를 입었다면
                    monsterEffectiveDefense = selectedMonster.defense + selectedMonster.luck; // 몬스터의 기본 방어력
                }

                let damage = atk - monsterEffectiveDefense;
                if (damage < 0) damage = 0;

                currentMonsterHP -= damage;
                if (currentMonsterHP < 0) currentMonsterHP = 0;

                resultDiv.innerHTML += `${name}의 공격(${atk}) → ${selectedMonster.name} (방어값 ${monsterEffectiveDefense}). ${selectedMonster.name}가 총 ${damage}만큼의 피해를 받았습니다.<br>`;
            }
        });
    } else {
        resultDiv.innerHTML += `이번 턴에 몬스터를 공격한 유저가 없습니다.<br>`;
    }

    // (3) 다음 턴 준비 (유저 공격/방어력 값 초기화)
    userAttackPowers = {};
    userDefensePowers = {};
    userActions = {}; // 다음 턴 시작 시 유저 행동을 새로 선택하도록 userActions 초기화

    // (4) 현재 HP 출력 (몬스터와 유저)
    resultDiv.innerHTML += `<br>${selectedMonster.name} HP: ${currentMonsterHP}<br>`;
    for (const [name, hp] of Object.entries(currentUserHPs)) {
        resultDiv.innerHTML += `${name} HP: ${hp}<br>`;
    }

    // 턴 결과 저장 및 UI 갱신 (기존과 동일)
    const log = localStorage.getItem('battleLogs') ? JSON.parse(localStorage.getItem('battleLogs')) : [];
    log.push({
        turn: turn,
        content: resultDiv.innerHTML,
        timestamp: new Date().toLocaleString()
    });
    localStorage.setItem('battleLogs', JSON.stringify(log));

    localStorage.setItem('savedUserHPs', JSON.stringify(currentUserHPs));
    localStorage.setItem('savedMonsterHP', currentMonsterHP);

    renderHPManager(); // 체력 조정 UI 동기화

    const copyTurnBtn = document.createElement('button');
    copyTurnBtn.textContent = '정산 결과 전체 복사';
    copyTurnBtn.onclick = () => {
        navigator.clipboard.writeText(resultDiv.innerText);
        alert('정산 결과가 복사되었습니다!');
    };
    resultDiv.appendChild(copyTurnBtn);

    turn++;
});

// 모바일 메뉴 토글 기능
const menuToggle = document.querySelector('.menu-toggle');
const menu = document.querySelector('.menu');

menuToggle.addEventListener('click', () => {
    menu.classList.toggle('open');
});