let allCharacters = []; // JSON에서 불러온 모든 캐릭터 데이터
let participatingCharacters = []; // 현재 전투에 참여하는 캐릭터
let boss = null;
let currentBossHP = 0;
let turn = 1;

// 보스 데이터는 bosses.json에서 불러옴
let bossesData = [];

// === 유틸리티 함수 ===
function rollDice(times, sides) {
    let total = 0;
    for (let i = 0; i < times; i++) {
        total += Math.floor(Math.random() * sides) + 1;
    }
    return total;
}

// 행운 다이스 결과 판정 (캐릭터용)
function getLuckResult(luckStat) {
    const roll = rollDice(1, 15) + luckStat;
    if (roll <= 2) return 'fail';
    if (roll >= 14) return 'critical';
    return 'success';
}
// 보스의 행운 다이스 결과는 luckThresholds를 사용해야 함
function getBossLuckResult(bossLuckStat, bossLuckThresholds) {
    const roll = rollDice(1, 10); // 보스의 luckDice는 [1, 10]이므로 1d10 굴림

    if (bossLuckThresholds.fail.includes(roll)) return 'fail';
    // success는 fail, critical에 해당하지 않는 경우로 처리
    if (bossLuckThresholds.critical.includes(roll)) return 'critical';
    return 'success';
}


// 랜덤 캐릭터 선택 (제외할 캐릭터 지정 가능)
function getRandomCharacters(count, excludeChar = null) {
    const availableChars = participatingCharacters.filter(c => c !== excludeChar && c.status.currentHP > 0);
    if (availableChars.length === 0) return [];

    const shuffled = availableChars.sort(() => 0.5 - Math.random());
    return shuffled.slice(0, Math.min(count, availableChars.length));
}

// === 데이터 로딩 ===
async function fetchCharactersAndRender() {
    try {
        const charRes = await fetch('characters.json');
        allCharacters = await charRes.json();

        const bossRes = await fetch('bosses.json');
        bossesData = await bossRes.json();

        // 초기 보스 설정 (곡두) - bosses.json에 '곡두'가 있어야 함
        boss = bossesData.find(b => b.name === "곡두");
        // 만약 '곡두'가 없다면 첫 번째 보스 또는 기본값으로 설정
        if (!boss && bossesData.length > 0) {
            boss = bossesData[0];
        } else if (!boss) {
            console.error("Warning: '곡두' 보스를 찾을 수 없습니다. 기본 보스 설정을 확인해주세요.");
            // 임시 보스 데이터 또는 에러 처리 (기본 defenseDice 값 추가)
            boss = {
                name: "기본 보스",
                maxHP: 500,
                attackDice: [2, 6],
                defenseDice: [1, 10], // 기본 defenseDice 추가
                luckDice: [1, 15],
                luckThresholds: { "fail": [1], "success": [2, 3, 4, 5, 6, 7, 8], "critical": [9, 10] }, // 기본 luckThresholds 추가
                attackPattern: { targets: 1 }
            };
        }
        currentBossHP = boss.maxHP;

        // 보스 선택 드롭다운에 bossesData의 모든 보스를 로드
        const bossSelect = document.getElementById('bossSelect');
        bossSelect.innerHTML = ''; // 기존 옵션 비우기
        bossesData.forEach(b => {
            const opt = document.createElement('option');
            opt.value = b.name;
            opt.textContent = b.name;
            bossSelect.appendChild(opt);
        });
        // 현재 선택된 보스를 UI에 반영
        if (boss) {
            bossSelect.value = boss.name;
        }

        renderCharactersUI();
    } catch (error) {
        console.error("데이터 로딩 중 오류 발생:", error);
    }
}

// === UI 렌더링 ===
function renderCharactersUI() {
    const list = document.getElementById('characterList');
    list.innerHTML = '';

    allCharacters.forEach((charData, idx) => {
        const container = document.createElement('div');
        container.className = 'char-container';

        // 캐릭터 초기 상태 설정 (JSON에서는 스탯만 가져옴)
        const char = { ...charData }; // 원본 데이터 복사
        char.status = {
            currentHP: 100 + char.hp * 10,
            maxHP: 100 + char.hp * 10,
            originalMaxHP: 100 + char.hp * 10, // 검은 피 종료 시점 복귀를 위해 저장
            resonance: 0,
            madness: 0,
            buffs: [], // { type: 'soulResonance' / 'blackBlood', remainingTurns: N, value: X }
            activeSkills: [] // 예: { name: '악', usedInTurn: 턴수 }
        };

        // 분노 천성 적용 (체력 고정)
        if (char.traits.includes('분노')) {
            char.status.maxHP = 50;
            char.status.currentHP = 50;
            char.status.originalMaxHP = 50;
        }

        const charHeader = document.createElement('div');
        charHeader.className = 'char-header';
        charHeader.innerHTML = `
            <div>
                <input type="checkbox" id="char-active-${idx}" class="char-active" checked>
                <label for="char-active-${idx}"><strong>${char.name}</strong></label>
            </div>
            <div class="status-info" id="status-info-${idx}"></div>
        `;
        container.appendChild(charHeader);

        const controlsDiv = document.createElement('div');
        controlsDiv.className = 'char-controls';

        // 행동 선택 (공격/방어/아이템)
        const actionGroup = document.createElement('div');
        actionGroup.className = 'action-select-group';
        actionGroup.innerHTML = `<label>행동:</label>`;
        const actionSelect = document.createElement('select');
        actionSelect.id = `action-${idx}`;
        ['attack', 'defense', 'item'].forEach(act => {
            const opt = document.createElement('option');
            opt.value = act;
            opt.textContent = act === 'attack' ? '공격' : act === 'defense' ? '방어' : '아이템 사용';
            actionSelect.appendChild(opt);
        });
        actionGroup.appendChild(actionSelect);
        controlsDiv.appendChild(actionGroup);

        // 타인 지정 (방어/아이템 전용)
        const targetGroup = document.createElement('div');
        targetGroup.className = 'target-select-group';
        targetGroup.innerHTML = `<label>대상:</label>`;
        const targetSelect = document.createElement('select');
        targetSelect.id = `target-${idx}`;
        targetSelect.innerHTML = `<option value="">-- 자신/보스 --</option>`; // 기본값: 자신/보스
        allCharacters.forEach((c, i) => {
            if (c.name !== char.name) { // 자신 제외
                const opt = document.createElement('option');
                opt.value = c.name;
                opt.textContent = c.name;
                targetSelect.appendChild(opt);
            }
        });
        targetGroup.appendChild(targetSelect);
        controlsDiv.appendChild(targetGroup);

        // 천성(Trait) 선택 드롭다운 (여기서 '탐욕' 천성은 제외하고 선택지로만 제공)
        const traitGroup = document.createElement('div');
        traitGroup.className = 'trait-select-group';
        traitGroup.innerHTML = `<label>천성:</label>`;
        const traitSelect = document.createElement('select');
        traitSelect.id = `trait-${idx}`;
        traitSelect.innerHTML = `<option value="none">-- 선택 안 함 --</option>`;
        char.traits.forEach(tr => {
            // '탐욕' 천성은 패시브이므로 드롭다운에서 선택할 필요 없음
            if (tr !== '탐욕') {
                const opt = document.createElement('option');
                opt.value = tr;
                opt.textContent = tr;
                traitSelect.appendChild(opt);
            }
        });
        traitGroup.appendChild(traitSelect);
        controlsDiv.appendChild(traitGroup);

        // 재능(Talent) 선택 드롭다운
        const talentGroup = document.createElement('div');
        talentGroup.className = 'talent-select-group';
        talentGroup.innerHTML = `<label>재능:</label>`;

        const talentSelect = document.createElement('select');
        talentSelect.id = `talent-${idx}`;
        talentSelect.innerHTML = `<option value="none">-- 선택 안 함 --</option>`;

        // !!! 이 forEach 루프를 아래와 같이 수정해야 합니다. !!!
        char.talents.forEach(tl => {
            // '광' 재능은 드롭다운에 직접 추가하지 않습니다.
            if (tl === '광') {
                // '광' 재능이 있으면 '검은 피' 옵션을 추가
                // 단, '검은 피'가 이미 추가되었는지 확인하여 중복 추가를 방지합니다.
                // (char.talents 배열에 '검은 피'가 직접 명시될 일은 없으므로 사실상 !talentSelect.querySelector()만으로 충분합니다)
                if (!talentSelect.querySelector('option[value="검은 피"]')) {
                    const blackBloodOption = document.createElement('option');
                    blackBloodOption.value = '검은 피';
                    blackBloodOption.textContent = '검은 피';
                    talentSelect.appendChild(blackBloodOption);
                }
            } else {
                // '광'이 아닌 다른 재능들은 원래대로 드롭다운에 추가합니다.
                const opt = document.createElement('option');
                opt.value = tl;
                opt.textContent = tl;
                talentSelect.appendChild(opt);
            }
        });
        // !!! forEach 루프 수정 끝 !!!

        talentGroup.appendChild(talentSelect);
        controlsDiv.appendChild(talentGroup);

        // 영혼의 공명 활성화 체크박스 (액티브 스킬)
        const soulResonanceGroup = document.createElement('div');
        soulResonanceGroup.className = 'special-ability-group';
        soulResonanceGroup.id = `soul-resonance-group-${idx}`;

        // '영혼의 공명'은 '교만' 천성 또는 '악' 재능을 가진 캐릭터만 사용 가능
        const canUseSoulResonance = char.traits.includes('교만') || char.talents.includes('악');

        if (canUseSoulResonance) {
            soulResonanceGroup.style.display = 'flex';
            soulResonanceGroup.innerHTML = `
                <input type="checkbox" id="soul-resonance-active-${idx}" class="soul-resonance-active">
                <label for="soul-resonance-active-${idx}">영혼의 공명 사용</label>
            `;
            const partnerSelect = document.createElement('select');
            partnerSelect.id = `soul-resonance-partner-${idx}`;
            partnerSelect.className = 'soul-resonance-partner-select';
            partnerSelect.innerHTML = `<option value="none">-- 파트너 선택 --</option>`;
            // 모든 캐릭터를 옵션으로 추가 (자기 자신 제외)
            allCharacters.forEach((c, i) => {
                if (c.name !== char.name) {
                    const opt = document.createElement('option');
                    opt.value = c.name;
                    opt.textContent = c.name;
                    partnerSelect.appendChild(opt);
                }
            });
            soulResonanceGroup.appendChild(partnerSelect);
        } else {
            soulResonanceGroup.style.display = 'none'; // 조건 불충족 시 숨김
        }
        controlsDiv.appendChild(soulResonanceGroup);


        container.appendChild(controlsDiv);
        list.appendChild(container);

        // UI 요소 참조 저장 및 초기 상태 업데이트
        char.ui = {
            actionSelect: actionSelect,
            targetSelect: targetSelect,
            traitSelect: traitSelect,
            talentSelect: talentSelect,
            activeCheckbox: document.getElementById(`char-active-${idx}`),
            statusInfoDiv: document.getElementById(`status-info-${idx}`),
            soulResonanceCheckbox: document.getElementById(`soul-resonance-active-${idx}`),
            soulResonancePartnerSelect: document.getElementById(`soul-resonance-partner-${idx}`)
        };
        updateCharacterStatusUI(char); // 초기 상태 표시

        // 참여 캐릭터 배열에 추가 (기본적으로 모두 참여)
        participatingCharacters.push(char);

        // 체크박스 변경 시 참여 캐릭터 목록 업데이트
        char.ui.activeCheckbox.addEventListener('change', () => {
            if (char.ui.activeCheckbox.checked) {
                if (!participatingCharacters.includes(char)) {
                    participatingCharacters.push(char);
                }
            } else {
                participatingCharacters = participatingCharacters.filter(c => c !== char);
            }
        });
    });
}

// 캐릭터 상태 UI 업데이트
function updateCharacterStatusUI(char) {
    if (!char.ui || !char.ui.statusInfoDiv) return;
    const status = char.status;
    let hpDisplay = `HP: ${status.currentHP}/${status.maxHP}`;

    let buffsInfo = '';
    if (status.buffs.length > 0) {
        const activeBuffs = status.buffs.map(b => {
            let buffText = b.type;
            if (b.type === 'soulResonance') buffText = '영혼의 공명';
            else if (b.type === 'blackBlood') buffText = '검은 피';
            else if (b.type === 'attackDown') buffText = '공격력 감소';
            else if (b.type === 'defenseDown') buffText = '방어력 감소';
            else if (b.type === 'disableTalents') buffText = '재능 사용 불가';
            else if (b.type === 'incapacitated') buffText = '행동 불능';

            if (b.remainingTurns !== undefined) {
                buffText += `(${b.remainingTurns}턴)`;
            }
            return buffText;
        }).join(', ');
        buffsInfo = ` | 버프: ${activeBuffs}`;
    }

    let madnessInfo = '';
    // '광' 또는 '악' 재능을 가진 캐릭터에게만 광기 표시
    if (char.talents.includes('광') || char.talents.includes('악')) {
        madnessInfo = ` | 광기: ${status.madness}`;
        if (char.traits.includes('분노')) {
            madnessInfo += ` (면역)`; // 분노 천성 캐릭터는 광기 수치 옆에 '면역'을 추가로 표시
        }
    }

    // 공명률 표시 형식 변경: (현재값/최대요구치%)
    const maxResonanceRequired = char.traits.includes('탐욕') ? 70 : 100; // '탐욕' 천성에 따라 최대 요구치 변경
    char.ui.statusInfoDiv.innerHTML = `
        ${hpDisplay} | 공명률: ${status.resonance}% (${status.resonance}/${maxResonanceRequired}%) ${madnessInfo} ${buffsInfo}
    `;
}

// === 턴 계산 로직 ===
document.getElementById('calculateTurnBtn').addEventListener('click', calculateTurn);
document.getElementById('bossSelect').addEventListener('change', (e) => {
    boss = bossesData.find(b => b.name === e.target.value);
    currentBossHP = boss.maxHP;
    document.getElementById('result').innerHTML = `보스 ${boss.name}이(가) 선택되었습니다. 현재 HP: ${currentBossHP}\n`;
    document.getElementById('calcDetails').innerHTML = ''; // 상세로그 초기화
    turn = 1; // 보스 변경 시 턴 초기화
    resetCharacterStates(); // 캐릭터 상태 초기화
});

function resetCharacterStates() {
    allCharacters.forEach(char => {
        char.status.currentHP = char.status.originalMaxHP; // 원래 최대 체력으로 복구
        char.status.maxHP = char.status.originalMaxHP; // 원래 최대 체력으로 복구
        char.status.resonance = 0;
        char.status.madness = 0;
        char.status.buffs = [];
        char.status.activeSkills = [];
        // 영혼의 공명 체크박스 초기화
        if (char.ui && char.ui.soulResonanceCheckbox) { // null 체크 추가
            char.ui.soulResonanceCheckbox.checked = false;
        }
        if (char.ui && char.ui.soulResonancePartnerSelect) {
            char.ui.soulResonancePartnerSelect.value = 'none';
        }
        // 드롭다운 초기화
        if (char.ui) {
            char.ui.actionSelect.value = 'attack';
            char.ui.targetSelect.value = '';
            char.ui.traitSelect.value = 'none'; // 천성 드롭다운 초기화도 'none'으로
            char.ui.talentSelect.value = 'none';
        }

        updateCharacterStatusUI(char);
    });
    document.getElementById('calculateTurnBtn').disabled = false;
}

async function calculateTurn() {
    const resultDiv = document.getElementById('result');
    const calcDetails = document.getElementById('calcDetails');
    calcDetails.innerHTML += `--- 턴 ${turn} 시작 ---\n`;
    resultDiv.innerHTML = `=== [턴 ${turn}] 정산 ===\n`;

    // --- 전투 결과 요약을 위한 변수 초기화 ---
    let summaryBossDamageTaken = 0;
    let summaryBossAttackSummary = []; // { target: char.name, damage: X, protectedBy: Y }
    let summaryCharStatusChanges = []; // { char: char.name, effect: 'debuffed', type: 'attackDown' }
    let summaryCharacterActionsDetail = []; // 각 캐릭터의 행동 요약 상세

    // 0. 행동 불능 상태 체크 (보스 전조 '변화' 등)
    const incapacitatedChars = participatingCharacters.filter(char => char.status.buffs.some(b => b.type === 'incapacitated'));
    if (incapacitatedChars.length > 0) {
        calcDetails.innerHTML += `이번 턴, 다음 캐릭터들은 행동 불능 상태입니다: ${incapacitatedChars.map(c => c.name).join(', ')}\n`;
        resultDiv.innerHTML += `** 이번 턴, ${incapacitatedChars.map(c => c.name).join(', ')}은(는) 행동 불능 상태입니다. **\n`;
    }

    // 1. 적의 행동 전조
    let currentPrecursor = null;
    if (boss.precursors && boss.precursors.length > 0) {
        currentPrecursor = boss.precursors[(turn - 1) % boss.precursors.length];
        calcDetails.innerHTML += `\n=== 보스 전조 ===\n`;
        resultDiv.innerHTML += `\n--- 보스 전조: ${currentPrecursor.name} ---\n`;
        currentPrecursor.text.forEach(line => calcDetails.innerHTML += `${line}\n`);
        resultDiv.innerHTML += `설명: ${currentPrecursor.text.join(' ')}\n`; // 요약에 전조 설명 추가

        // 전조 효과 적용
        const effect = currentPrecursor.effect;
        if (effect) {
            let affectedChars = [];
            if (effect.stunAll) {
                affectedChars = participatingCharacters;
            } else if (effect.targetCount) {
                affectedChars = getRandomCharacters(effect.targetCount);
            }

            affectedChars.forEach(char => {
                if (effect.resonanceDown) {
                    char.status.resonance = Math.max(0, char.status.resonance - effect.resonanceDown);
                    calcDetails.innerHTML += `${char.name}의 공명률이 ${effect.resonanceDown} 감소하였습니다. (현재: ${char.status.resonance}%)\n`;
                    summaryCharStatusChanges.push({ char: char.name, effect: 'resonanceDown', value: effect.resonanceDown });
                }
                if (effect.attackDown) {
                    char.status.buffs.push({ type: 'attackDown', value: effect.attackDown, remainingTurns: 1 });
                    calcDetails.innerHTML += `${char.name}의 공격력이 ${effect.attackDown} 감소합니다.\n`;
                    summaryCharStatusChanges.push({ char: char.name, effect: 'attackDown', value: effect.attackDown });
                }
                if (effect.defenseDown) {
                    char.status.buffs.push({ type: 'defenseDown', value: effect.defenseDown, remainingTurns: 1 });
                    calcDetails.innerHTML += `${char.name}의 방어력이 ${effect.defenseDown} 감소합니다.\n`;
                    summaryCharStatusChanges.push({ char: char.name, effect: 'defenseDown', value: effect.defenseDown });
                }
                if (effect.disableTalents) {
                    char.status.buffs.push({ type: 'disableTalents', remainingTurns: 1 });
                    calcDetails.innerHTML += `${char.name}는 이번 턴 재능을 사용할 수 없습니다.\n`;
                    summaryCharStatusChanges.push({ char: char.name, effect: 'disableTalents' });
                }
                if (effect.stunAll) {
                    char.status.buffs.push({ type: 'incapacitated', remainingTurns: 1 });
                    calcDetails.innerHTML += `${char.name}가 행동 불능 상태가 되었습니다.\n`;
                    summaryCharStatusChanges.push({ char: char.name, effect: 'incapacitated' });
                }
            });
        }
    }

    if (summaryCharStatusChanges.length > 0) {
        resultDiv.innerHTML += `** 전조 효과:**\n`;
        summaryCharStatusChanges.forEach(change => {
            if (change.effect === 'resonanceDown') resultDiv.innerHTML += ` - ${change.char}: 공명률 ${change.value} 감소\n`;
            else if (change.effect === 'attackDown') resultDiv.innerHTML += ` - ${change.char}: 공격력 감소 디버프 적용\n`;
            else if (change.effect === 'defenseDown') resultDiv.innerHTML += ` - ${change.char}: 방어력 감소 디버프 적용\n`;
            else if (change.effect === 'disableTalents') resultDiv.innerHTML += ` - ${change.char}: 재능 사용 불가\n`;
            else if (change.effect === 'incapacitated') resultDiv.innerHTML += ` - ${change.char}: 행동 불능 상태\n`;
        });
    }

    calcDetails.innerHTML += `\n=== 캐릭터 행동 선언 및 처리 ===\n`;
    const charActions = [];
    const soulResonanceRequests = []; // 영혼의 공명 요청 정보 { requester: CharObject, partnerName: String }

    // 2. 캐릭터 행동 선언 및 일부 처리 (공명률 회복, 검은 피, 아이템)
    for (const char of participatingCharacters) {
        let charActionDetail = { char: char.name, actions: [] };

        if (char.status.buffs.some(b => b.type === 'incapacitated')) {
            charActions.push({ char: char, action: 'incapacitated' });
            charActionDetail.actions.push('행동 불능 상태');
            summaryCharacterActionsDetail.push(charActionDetail);
            continue;
        }

        const action = char.ui.actionSelect.value;
        const targetName = char.ui.targetSelect.value;
        const selectedTrait = char.ui.traitSelect.value;
        const selectedTalent = char.ui.talentSelect.value;

        const targetChar = targetName ? participatingCharacters.find(c => c.name === targetName) : char;

        const talentsDisabled = char.status.buffs.some(b => b.type === 'disableTalents');

        const charAction = {
            char: char,
            action: action,
            target: targetChar,
            selectedTrait: selectedTrait,
            selectedTalent: selectedTalent,
            talentsDisabled: talentsDisabled,
            luckResult: null
        };
        charActions.push(charAction);

        // --- 천성 능력 처리 (교만) --- (이전 코드와 동일)
        if (selectedTrait === '교만' && char.traits.includes('교만')) {
            if (!targetChar) {
                calcDetails.innerHTML += `${char.name}: [교만] 사용 실패 (유효한 대상 없음)\n`;
                charActionDetail.actions.push('[교만] 사용 실패 (대상 없음)');
            } else {
                targetChar.status.resonance = Math.min(100, targetChar.status.resonance + 15);
                calcDetails.innerHTML += `${char.name}이(가) [교만]을 사용하여 ${targetChar.name}의 공명률을 15 회복시켰습니다. (현재: ${targetChar.status.resonance}%)\n`;
                charActionDetail.actions.push(`[교만] 사용 -> ${targetChar.name} 공명률 +15`);
            }
        }

        // '영혼의 공명' 체크박스 및 파트너 선택 처리
        if (char.ui.soulResonanceCheckbox && char.ui.soulResonanceCheckbox.checked) {
            const partnerName = char.ui.soulResonancePartnerSelect ? char.ui.soulResonancePartnerSelect.value : 'none';

            if (partnerName === 'none') {
                calcDetails.innerHTML += `${char.name}는 '영혼의 공명'을 요청했으나 파트너를 지정하지 않았습니다.\n`;
                charActionDetail.actions.push('[영혼의 공명] 발동 요청 실패 (파트너 미지정)');
                char.ui.soulResonanceCheckbox.checked = false; // 체크박스 해제
            } else {
                const potentialPartner = participatingCharacters.find(c => c.name === partnerName);

                if (potentialPartner) {
                    const canUseSoulResonanceTraitTalent = char.traits.includes('교만') || char.talents.includes('악');
                    const requiredResonance = char.traits.includes('탐욕') ? 70 : 100;

                    // 추가: 광기 50% 이상이면 영혼의 공명 사용 불가
                    if (char.status.madness >= 50) { // 광기 50 이상이면 사용 불가
                        calcDetails.innerHTML += `${char.name}는 '영혼의 공명'을 요청했으나 광기 수치가 50 이상입니다. (현재: ${char.status.madness})\n`;
                        charActionDetail.actions.push(`[영혼의 공명] 발동 요청 실패 (광기 50 이상: ${char.status.madness}%)`);
                        char.ui.soulResonanceCheckbox.checked = false;
                        if (char.ui.soulResonancePartnerSelect) char.ui.soulResonancePartnerSelect.value = 'none';
                    } else if (canUseSoulResonanceTraitTalent && char.status.resonance >= requiredResonance) {
                        soulResonanceRequests.push({ requester: char, partnerName: partnerName });
                        charActionDetail.actions.push(`[영혼의 공명] 발동 요청 (파트너: ${partnerName})`);
                    } else {
                        calcDetails.innerHTML += `${char.name}는 '영혼의 공명'을 요청했으나 공명률이 ${requiredResonance}% 미만이거나 자격이 없습니다. (현재: ${char.status.resonance}%)\n`;
                        charActionDetail.actions.push(`[영혼의 공명] 발동 요청 실패 (공명률 부족/자격 없음: 요구 ${requiredResonance}%, 현재 ${char.status.resonance}%)`);
                        char.ui.soulResonanceCheckbox.checked = false;
                        if (char.ui.soulResonancePartnerSelect) char.ui.soulResonancePartnerSelect.value = 'none';
                    }
                } else {
                    calcDetails.innerHTML += `${char.name}는 '영혼의 공명'을 요청했으나 유효하지 않은 파트너(${partnerName})를 지정했습니다.\n`;
                    charActionDetail.actions.push('[영혼의 공명] 발동 요청 실패 (유효하지 않은 파트너)');
                    char.ui.soulResonanceCheckbox.checked = false;
                    if (char.ui.soulResonancePartnerSelect) char.ui.soulResonancePartnerSelect.value = 'none';
                }
            }
        }

        // --- 재능 능력 처리 ---
        if (talentsDisabled) {
            if (selectedTalent !== 'none') {
                calcDetails.innerHTML += `${char.name}: 재능 [${selectedTalent}] 사용 불가 (전조 효과)\n`;
                charActionDetail.actions.push(`[재능: ${selectedTalent}] 사용 불가 (디버프)`);
            }
        } else {
            // '광' 재능을 가진 캐릭터만 '검은 피'를 액티브로 사용할 수 있음
            if (selectedTalent === '검은 피' && char.talents.includes('광')) { // '악'은 제거, '광'만 검은 피 사용 가능
                if (!char.status.buffs.some(b => b.type === 'blackBlood')) { // 중복 적용 방지
                    char.status.buffs.push({ type: 'blackBlood', remainingTurns: 4 });

                    // '분노' 천성이 없는 경우에만 최대 HP를 2배로 증가
                    if (!char.traits.includes('분노')) {
                        char.status.maxHP = char.status.originalMaxHP * 2;
                        char.status.currentHP = Math.min(char.status.currentHP * 2, char.status.maxHP);
                        calcDetails.innerHTML += `${char.name}가 [검은 피]를 사용하였습니다. 최대 HP가 ${char.status.maxHP}로 증가했습니다.\n`;
                        charActionDetail.actions.push(`[재능: 검은 피] 사용 (HP 2배, 3턴간 피해 50% 감소 및 방어 2배)`);
                    } else {
                        calcDetails.innerHTML += `${char.name} (분노)가 [검은 피]를 사용하였습니다. (3턴간 피해 50% 감소 및 방어 2배) - 체력 고정 50 유지\n`;
                        charActionDetail.actions.push(`[재능: 검은 피] 사용 (피해 50% 감소 및 방어 2배)`);
                    }

                    // '분노' 천성이 없는 경우에만 광기 증가
                    if (!char.traits.includes('분노')) {
                        char.status.madness = Math.min(50, char.status.madness + 10);
                        calcDetails.innerHTML += `${char.name}의 광기 수치가 10 증가하였습니다. (현재: ${char.status.madness})\n`;
                        charActionDetail.actions.push(`광기 +10 (현재: ${char.status.madness})`); // 광기 증가량 및 현재 값 요약에 추가
                    } else {
                        calcDetails.innerHTML += `${char.name} (분노)는 광기 축적에 면역입니다.\n`;
                    }
                } else {
                    calcDetails.innerHTML += `${char.name}는 이미 [검은 피] 효과를 받고 있습니다.\n`;
                    charActionDetail.actions.push(`[재능: 검은 피] 사용 시도 (이미 적용 중)`);
                }
            }
            // '악' 재능은 이제 '검은 피'를 사용하지 않고 공명률 회복만
            else if (selectedTalent === '악' && char.talents.includes('악')) {
                if (char.status.activeSkills.some(s => s.name === '악')) {
                    calcDetails.innerHTML += `${char.name}: [악]은 전투 당 1회만 사용 가능합니다.\n`;
                    charActionDetail.actions.push('[재능: 악] 사용 실패 (1회 제한)');
                } else if (!targetChar) {
                    calcDetails.innerHTML += `${char.name}: [악] 사용 실패 (유효한 대상 없음)\n`;
                    charActionDetail.actions.push('[재능: 악] 사용 실패 (대상 없음)');
                } else {
                    targetChar.status.resonance = Math.min(100, targetChar.status.resonance + 70);
                    char.status.activeSkills.push({ name: '악', usedInTurn: turn });
                    calcDetails.innerHTML += `${char.name}이(가) [악]을 사용하여 ${targetChar.name}의 공명률을 70 회복시켰습니다. (현재: ${targetChar.status.resonance}%)\n`;
                    charActionDetail.actions.push(`[재능: 악] 사용 -> ${targetChar.name} 공명률 +70`);
                }
            }
        }

        // 아이템 사용
        if (action === 'item') {
            if (char.items && char.items.potion > 0) {
                const healTarget = targetChar || char;
                const healedAmount = 10;
                healTarget.status.currentHP = Math.min(healTarget.status.currentHP + healedAmount, healTarget.status.maxHP);
                char.items.potion--;
                calcDetails.innerHTML += `${char.name}이(가) ${healTarget.name}에게 회복제를 사용하였습니다. (+${healedAmount}HP, 남은 포션: ${char.items.potion})\n`;
                charActionDetail.actions.push(`아이템 사용: ${healTarget.name}에게 +${healedAmount}HP`);
            } else {
                calcDetails.innerHTML += `${char.name}이(가) 아이템 사용을 시도했으나 포션이 없습니다.\n`;
                charAction.action = 'none'; // 실제 행동 취소
                charActionDetail.actions.push('아이템 사용 실패 (포션 없음)');
            }
        } else if (action === 'attack') {
            charActionDetail.actions.push('공격 행동 선언 (대상: 보스)');
        } else if (action === 'defense') {
            const defTarget = charAction.target ? charAction.target.name : char.name;
            charActionDetail.actions.push(`방어 행동 선언 (대상: ${defTarget})`);
        }
        summaryCharacterActionsDetail.push(charActionDetail);
    } // for of participatingCharacters

    // 영혼의 공명 발동 로직 (상호 지정 확인)
    calcDetails.innerHTML += `\n=== 영혼의 공명 발동 시도 ===\n`;
    const activatedSoulResonancePairs = [];
    const processedCharsForSR = new Set(); // 이미 영혼의 공명 처리된 캐릭터 (중복 발동 방지)

    // 요청 목록을 순회하며 상호 지정 쌍 찾기
    for (const req of soulResonanceRequests) {
        const requester = req.requester;
        const partnerName = req.partnerName;

        // 이미 처리된 캐릭터는 건너뛴다.
        if (processedCharsForSR.has(requester.name)) {
            continue;
        }

        // 지정된 파트너 찾기
        const partnerRequest = soulResonanceRequests.find(
            pReq => pReq.requester.name === partnerName && pReq.partnerName === requester.name
        );

        // 상호 지정을 찾았고, 두 캐릭터 모두 아직 처리되지 않았다면
        if (partnerRequest && !processedCharsForSR.has(partnerName)) {
            const char1 = requester;
            const char2 = partnerRequest.requester;

            // '탐욕' 천성 여부에 따라 공명률 조건 확인
            const resonanceCondition1 = char1.traits.includes('탐욕') ? 70 : 100;
            const resonanceCondition2 = char2.traits.includes('탐욕') ? 70 : 100;

            // 추가 조건 확인: 광기 50% 이상 여부
            const char1MadnessLimit = (char1.talents.includes('광') || char1.talents.includes('악')) && char1.status.madness >= 50;
            const char2MadnessLimit = (char2.talents.includes('광') || char2.talents.includes('악')) && char2.status.madness >= 50;

            let pairSummary = { chars: [char1.name, char2.name], result: '실패', reason: '' };

            if (char1MadnessLimit || char2MadnessLimit) {
                let failedChars = [];
                if (char1MadnessLimit) failedChars.push(char1.name);
                if (char2MadnessLimit) failedChars.push(char2.name);
                calcDetails.innerHTML += `[영혼의 공명] 발동 실패 (${char1.name}, ${char2.name}): ${failedChars.join(', ')}는 광기 수치 50 이상으로 사용 불가합니다.\n`;
                pairSummary.reason = `${failedChars.join(', ')} 광기 50 이상`;
            } else if (char1.status.resonance >= resonanceCondition1 && char2.status.resonance >= resonanceCondition2) {
                // 모든 조건 충족: 영혼의 공명 발동
                char1.status.buffs.push({ type: 'soulResonance', remainingTurns: 4 });
                char2.status.buffs.push({ type: 'soulResonance', remainingTurns: 4 });
                char1.status.resonance = 0; // 공명률 소모
                char2.status.resonance = 0; // 공명률 소모
                activatedSoulResonancePairs.push({ char1: char1, char2: char2 });
                calcDetails.innerHTML += `${char1.name}와 ${char2.name}가 [영혼의 공명]을 발동하였습니다. (공명률 요구치: ${resonanceCondition1}%, ${resonanceCondition2}%) 다음 3턴간 공격 계수 1.5배 증가.\n`;
                pairSummary.result = '성공';
                pairSummary.reason = '공격 계수 1.5배 증가 (3턴)';

                // 이 두 캐릭터는 이번 턴에 영혼의 공명 처리가 완료되었으므로 표시
                processedCharsForSR.add(char1.name);
                processedCharsForSR.add(char2.name);
            } else {
                let failureReason = [];
                if (char1.status.resonance < resonanceCondition1) failureReason.push(`${char1.name} 공명률 부족 (${char1.status.resonance}%/${resonanceCondition1}%)`);
                if (char2.status.resonance < resonanceCondition2) failureReason.push(`${char2.name} 공명률 부족 (${char2.status.resonance}%/${resonanceCondition2}%)`);
                calcDetails.innerHTML += `[영혼의 공명] 발동 실패 (${char1.name}, ${char2.name}): ${failureReason.join(', ')}\n`;
                pairSummary.reason = failureReason.join(', ');
            }
            resultDiv.innerHTML += `** [영혼의 공명] 발동 시도 (${char1.name} ↔ ${char2.name}): ${pairSummary.result} - ${pairSummary.reason}**\n`;
        }
    }

    // 영혼의 공명 발동에 실패했거나, 상호 지정이 안 된 캐릭터들의 체크박스 해제 및 드롭다운 초기화
    // soulResonanceRequests에 있었지만 processedCharsForSR에 없는 캐릭터들
    soulResonanceRequests.forEach(req => {
        if (!processedCharsForSR.has(req.requester.name)) {
            if (req.requester.ui.soulResonanceCheckbox) {
                req.requester.ui.soulResonanceCheckbox.checked = false;
                // 파트너 선택 드롭다운도 초기화
                if (req.requester.ui.soulResonancePartnerSelect) {
                    req.requester.ui.soulResonancePartnerSelect.value = 'none';
                }
            }
            // 상호 지정 실패 메시지 추가 (예: A가 B를 지정했으나 B는 C를 지정한 경우)
            if (req.requester.status.resonance >= (req.requester.traits.includes('탐욕') ? 70 : 100) && (req.requester.traits.includes('교만') || req.requester.talents.includes('악'))) {
                const partnerFound = soulResonanceRequests.some(pReq => pReq.requester.name === req.partnerName && pReq.partnerName === req.requester.name);
                if (!partnerFound) {
                    calcDetails.innerHTML += `${req.requester.name}는 ${req.partnerName}를 지정했지만, 상호 지정이 이루어지지 않아 [영혼의 공명] 발동에 실패했습니다.\n`;
                    resultDiv.innerHTML += `- ${req.requester.name}의 [영혼의 공명] 발동 실패: 상호 파트너 지정 불일치.\n`;
                }
            }
        }
    });

    if (activatedSoulResonancePairs.length === 0 && soulResonanceRequests.length === 0 && participatingCharacters.some(char => char.traits.includes('교만') || char.talents.includes('악'))) {
        resultDiv.innerHTML += `** [영혼의 공명] 발동 요청이 없었거나, 모든 요청이 조건을 충족하지 못했습니다.**\n`;
    }


    resultDiv.innerHTML += `\n--- 캐릭터 행동 요약 ---\n`;
    summaryCharacterActionsDetail.forEach(detail => {
        resultDiv.innerHTML += `- ${detail.char}: ${detail.actions.join(', ')}\n`;
    });


    // 3. 행운 다이스 결과 및 최종 계수 계산 (공격/방어)
    calcDetails.innerHTML += `\n=== 캐릭터 공격/방어 계산 ===\n`;
    let defenseMap = new Map(); // key: 방어 대상, value: { defender: 방어 캐릭터 이름, value: 방어 계수 }
    let selfDefenseChars = new Set(); // 스스로 방어하는 캐릭터
    let successfulAttacks = []; // 보스에게 성공적으로 공격한 캐릭터
    let failedAttacks = []; // 아군에게 오사한 공격
    let failedDefenses = []; // 방어 실패 (대상 변경)

    charActions.forEach(charAction => {
        const char = charAction.char;
        let actionResultText = ''; // 상세 계산 과정에 추가될 행동 결과 요약

        if (charAction.action === 'incapacitated' || charAction.action === 'none') {
            return;
        }

        charAction.luckResult = getLuckResult(char.luck);
        calcDetails.innerHTML += `${char.name} (행운 ${char.luck}): 행운 다이스 결과 - ${charAction.luckResult}\n`;
        actionResultText += `${char.name} (행운 ${char.luck} | 결과: ${charAction.luckResult})`;

        let finalPower = 0;
        let originalPower = 0;

        if (charAction.action === 'attack') {
            originalPower = rollDice(2, 10) + char.attack * 5;
            finalPower = originalPower;
            calcDetails.innerHTML += `${char.name}의 기본 공격 계수: ${originalPower}\n`;
            actionResultText += ` - 공격 계수 기본 ${originalPower}`;
        } else if (charAction.action === 'defense') {
            originalPower = rollDice(2, 10) + char.defense * 5;
            finalPower = originalPower;
            calcDetails.innerHTML += `${char.name}의 기본 방어 계수: ${originalPower}\n`;
            actionResultText += ` - 방어 계수 기본 ${originalPower}`;
        }

        if (charAction.luckResult === 'critical') {
            finalPower += 30;
            calcDetails.innerHTML += `${char.name}의 행운 대성공으로 계수 +30. (최종: ${finalPower})\n`;
            actionResultText += ` (+행운 대성공 30)`;
        }

        const attackDownBuff = char.status.buffs.find(b => b.type === 'attackDown');
        if (attackDownBuff && charAction.action === 'attack') {
            finalPower = Math.max(0, finalPower - attackDownBuff.value);
            calcDetails.innerHTML += `${char.name}의 공격 계수가 전조로 인해 ${attackDownBuff.value} 감소하였습니다. (조정 후: ${finalPower})\n`;
            actionResultText += ` (-공격력 감소 ${attackDownBuff.value})`;
        }
        const defenseDownBuff = char.status.buffs.find(b => b.type === 'defenseDown');
        if (defenseDownBuff && charAction.action === 'defense') {
            finalPower = Math.max(0, finalPower - defenseDownBuff.value);
            calcDetails.innerHTML += `${char.name}의 방어 계수가 전조로 인해 ${defenseDownBuff.value} 감소하였습니다. (조정 후: ${finalPower})\n`;
            actionResultText += ` (-방어력 감소 ${defenseDownBuff.value})`;
        }

        if (charAction.selectedTalent === '투' && char.talents.includes('투') && charAction.action === 'attack' && !charAction.talentsDisabled) {
            finalPower *= 2;
            calcDetails.innerHTML += `${char.name}의 [투] 재능이 적용되어 공격 계수가 2배가 되었습니다. (조정 후: ${finalPower})\n`;
            actionResultText += ` (+재능 '투' 2배)`;
        }
        if (charAction.selectedTalent === '전' && char.talents.includes('전') && charAction.action === 'defense' && !charAction.talentsDisabled) {
            finalPower *= 1.5;
            calcDetails.innerHTML += `${char.name}의 [전] 재능이 적용되어 방어 계수가 1.5배가 되었습니다. (조정 후: ${finalPower})\n`;
            actionResultText += ` (+재능 '전' 1.5배)`;
        }

        const soulResonanceBuff = char.status.buffs.find(b => b.type === 'soulResonance');
        if (soulResonanceBuff && charAction.action === 'attack') {
            finalPower *= 1.5;
            calcDetails.innerHTML += `${char.name}의 [영혼의 공명] 버프가 적용되어 공격 계수가 1.5배가 되었습니다. (조정 후: ${finalPower})\n`;
            actionResultText += ` (+영혼의 공명 1.5배)`;
        }
        const blackBloodBuff = char.status.buffs.find(b => b.type === 'blackBlood');
        if (blackBloodBuff && charAction.action === 'defense') {
            finalPower *= 2;
            calcDetails.innerHTML += `${char.name}의 [검은 피] 버프가 적용되어 방어 계수가 2배가 되었습니다. (조정 후: ${finalPower})\n`;
            actionResultText += ` (+검은 피 2배)`;
        }

        charAction.finalPower = finalPower; // 계산된 finalPower를 charAction 객체에 저장
        actionResultText += ` -> 최종 계수: ${finalPower}\n`;
        calcDetails.innerHTML += actionResultText;

        // summaryCharacterActionsDetail 업데이트 (기존 charActionDetail 찾아서 추가)
        const charSummary = summaryCharacterActionsDetail.find(s => s.char === char.name);
        if (charSummary) {
            if (charAction.action === 'attack' && charAction.luckResult !== 'fail') {
                charSummary.actions.push(`보스 공격 (계수: ${finalPower})`);
            } else if (charAction.action === 'defense' && charAction.luckResult !== 'fail') {
                const targetCharName = charAction.target ? charAction.target.name : char.name;
                charSummary.actions.push(`${targetCharName} 방어 (계수: ${finalPower})`);
            } else if (charAction.action === 'failedAttack') {
                // 이미 failedAttacks 배열에서 처리되므로 여기서는 간단히 기록
                charSummary.actions.push(`아군 오사 (피해: ${finalPower})`);
            } else if (charAction.action === 'failedDefense') {
                // 이미 failedDefenses 배열에서 처리되므로 여기서는 간단히 기록
                charSummary.actions.push(`방어 대상 변경 (계수: ${finalPower})`);
            }
        }

        // 행운 실패 시 아군 오사 처리 (공격)
        if (charAction.luckResult === 'fail' && charAction.action === 'attack') {
            const attacker = char;
            const randomAlly = getRandomCharacters(1, attacker)[0];
            if (randomAlly) {
                calcDetails.innerHTML += `${attacker.name}의 행운 실패로 아군 ${randomAlly.name}에게 공격이 가해졌습니다. 피해량: ${charAction.finalPower}\n`;
                randomAlly.status.currentHP = Math.max(0, randomAlly.status.currentHP - charAction.finalPower);
                failedAttacks.push({ attacker: attacker.name, target: randomAlly.name, damage: charAction.finalPower });
            } else {
                calcDetails.innerHTML += `${attacker.name}의 행운 실패로 공격할 아군이 없습니다.\n`;
                failedAttacks.push({ attacker: attacker.name, target: '없음', damage: charAction.finalPower });
            }
            charAction.action = 'failedAttack';
        }
        // 행운 실패 시 아군 오사 처리 (방어)
        else if (charAction.luckResult === 'fail' && charAction.action === 'defense') {
            const defender = char;
            const randomAlly = getRandomCharacters(1, defender)[0];
            // 기존에 이 캐릭터가 방어하던 대상이 있다면 제거
            for (let [key, value] of defenseMap.entries()) {
                if (value.defender === defender.name) {
                    defenseMap.delete(key);
                }
            }
            if (selfDefenseChars.has(defender.name)) {
                selfDefenseChars.delete(defender.name);
            }

            if (randomAlly) {
                defenseMap.set(randomAlly.name, { defender: defender.name, value: charAction.finalPower });
                calcDetails.innerHTML += `${defender.name}의 행운 실패로 ${randomAlly.name}를(을) 대신 방어합니다. (방어값: ${charAction.finalPower})\n`;
                failedDefenses.push({ originalDefender: defender.name, newTarget: randomAlly.name, defenseValue: charAction.finalPower });
            } else {
                calcDetails.innerHTML += `${defender.name}의 행운 실패로 방어할 아군이 없습니다. ${defender.name}는 무방비 상태가 됩니다.\n`;
                failedDefenses.push({ originalDefender: defender.name, newTarget: '없음', defenseValue: charAction.finalPower });
            }
            charAction.action = 'failedDefense';
        }
        // 성공적인 공격/방어 등록
        else {
            if (charAction.action === 'attack') {
                successfulAttacks.push({ char: char.name, damage: charAction.finalPower });
            } else if (charAction.action === 'defense') {
                if (charAction.target && charAction.target.name !== char.name) {
                    defenseMap.set(charAction.target.name, { defender: char.name, value: charAction.finalPower });
                    calcDetails.innerHTML += `${char.name}이(가) ${charAction.target.name}를(을) 방어합니다. (방어 계수: ${charAction.finalPower})\n`;
                } else {
                    selfDefenseChars.add(char.name);
                    defenseMap.set(char.name, { defender: char.name, value: charAction.finalPower });
                    calcDetails.innerHTML += `${char.name}이(가) 스스로를 방어합니다. (방어 계수: ${charAction.finalPower})\n`;
                }
            }
        }
    });

    if (failedAttacks.length > 0) {
        resultDiv.innerHTML += `** 행운 실패로 인한 아군 오사:**\n`;
        failedAttacks.forEach(fa => {
            resultDiv.innerHTML += ` - ${fa.attacker}이(가) ${fa.target === '없음' ? '공격할 아군 없이' : `${fa.target}에게`} ${fa.damage}의 피해를 입혔습니다.\n`;
        });
    }
    if (failedDefenses.length > 0) {
        resultDiv.innerHTML += `** 행운 실패로 인한 방어 대상 변경:**\n`;
        failedDefenses.forEach(fd => {
            resultDiv.innerHTML += ` - ${fd.originalDefender}의 방어 (${fd.defenseValue})가 ${fd.newTarget === '없음' ? '무효화되었습니다.' : `${fd.newTarget}에게 이전되었습니다.`}\n`;
        });
    }

    // 4. 적의 행동 (공격)
    calcDetails.innerHTML += `\n=== 보스 행동 ===\n`;
    resultDiv.innerHTML += `\n--- 보스 공격 ---\n`;

    const bossAttackRoll = rollDice(boss.attackDice[0], boss.attackDice[1]);
    const bossLuckResult = getBossLuckResult(boss.luckDice[0], boss.luckThresholds); // 보스 행운 판정 함수 변경
    let bossFinalAttack = bossAttackRoll;

    let bossAttackResultLine = `${boss.name}의 공격 계수: ${bossAttackRoll}`;
    if (bossLuckResult === 'critical') {
        bossFinalAttack += 30; // 보스도 대성공 시 +30
        bossAttackResultLine += ` (행운 대성공으로 +30)`;
        calcDetails.innerHTML += `${boss.name}의 행운 대성공으로 공격 계수 +30.\n`;
    }
    bossAttackResultLine += ` -> 최종 ${bossFinalAttack}\n`;
    calcDetails.innerHTML += bossAttackResultLine;


    if (bossLuckResult === 'fail') {
        calcDetails.innerHTML += `${boss.name}의 행운 실패로 자신에게 피해를 입혔습니다.\n`;
        currentBossHP = Math.max(0, currentBossHP - bossFinalAttack);
        resultDiv.innerHTML += ` - ${boss.name}의 행운 실패로 자신에게 ${bossFinalAttack}의 피해를 입었습니다.\n`;
        summaryBossDamageTaken += bossFinalAttack; // 보스 스스로에게 입은 피해도 요약에 포함
    } else {
        const targetCount = boss.attackPattern.targets;
        const bossTargets = participatingCharacters.filter(c => c.status.currentHP > 0).sort(() => 0.5 - Math.random()).slice(0, targetCount); // 살아있는 캐릭터 중 랜덤 선택

        if (bossTargets.length > 0) {
            bossTargets.forEach(targetChar => {
                let damageTaken = bossFinalAttack;
                let defenderName = '없음';
                let protectedVal = 0;
                let isBlackBloodActive = false;

                calcDetails.innerHTML += `\n${boss.name}이(가) ${targetChar.name}을(를) 공격합니다.\n`;

                if (defenseMap.has(targetChar.name)) {
                    const defenseInfo = defenseMap.get(targetChar.name);
                    protectedVal = defenseInfo.value;
                    defenderName = defenseInfo.defender;
                    damageTaken = Math.max(0, damageTaken - protectedVal);
                    calcDetails.innerHTML += `${targetChar.name}에게 ${defenderName}의 방어 (${protectedVal})가 적용되었습니다. `;
                } else {
                    calcDetails.innerHTML += `${targetChar.name}에게 방어가 적용되지 않았습니다. `;
                }

                const blackBloodBuff = targetChar.status.buffs.find(b => b.type === 'blackBlood');
                if (blackBloodBuff) {
                    const originalDamage = damageTaken;
                    damageTaken = Math.floor(originalDamage / 2); // 정수로 처리
                    isBlackBloodActive = true;
                    calcDetails.innerHTML += `${targetChar.name}의 [검은 피]로 인해 받는 피해 ${originalDamage}이(가) 50% 감소하여 ${damageTaken}이(가) 되었습니다. `;
                }

                targetChar.status.currentHP = Math.max(0, targetChar.status.currentHP - damageTaken);
                calcDetails.innerHTML += `${targetChar.name}가 ${damageTaken}의 피해를 입었습니다. (잔여 HP: ${targetChar.status.currentHP}/${targetChar.status.maxHP})\n`;

                summaryBossAttackSummary.push({
                    target: targetChar.name,
                    damage: damageTaken,
                    protectedBy: defenderName === '없음' ? '' : `${defenderName} (${protectedVal})`,
                    blackBlood: isBlackBloodActive
                });
            });
        } else {
            calcDetails.innerHTML += `공격할 캐릭터가 없습니다.\n`;
            resultDiv.innerHTML += ` - 공격할 캐릭터가 없어 보스 공격이 헛방이 되었습니다.\n`;
        }
    }

    if (summaryBossAttackSummary.length > 0) {
        summaryBossAttackSummary.forEach(attack => {
            let line = ` - ${attack.target} (${attack.protectedBy ? `방어: ${attack.protectedBy}` : '무방비'})에게 ${attack.damage} 피해.`;
            if (attack.blackBlood) line += ` (검은 피 효과 적용)`;
            resultDiv.innerHTML += `${line}\n`;
        });
    }


    // 5. 캐릭터가 보스에게 공격한 데미지 적용
    let totalDamageToBoss = 0;
    calcDetails.innerHTML += `\n=== 캐릭터의 보스 공격 결과 ===\n`;
    charActions.forEach(charAction => {
        if (charAction.action === 'attack' && charAction.luckResult !== 'fail' && charAction.action !== 'incapacitated') {
            let damageDealt = charAction.finalPower;

            // 보스의 방어 다이스 굴림
            const bossDefenseRoll = rollDice(boss.defenseDice[0], boss.defenseDice[1]);
            let finalBossDefense = bossDefenseRoll;

            // 보스에게 방어력 감소 디버프가 있다면 적용 (아직 구현 안 됨, 필요시 추가)
            // (TODO: 보스에게 적용되는 디버프가 있다면 이 곳에 추가 로직)

            calcDetails.innerHTML += `  -> ${boss.name}의 방어 계수: ${finalBossDefense}\n`;
            damageDealt = Math.max(0, damageDealt - finalBossDefense);

            totalDamageToBoss += damageDealt;
            calcDetails.innerHTML += `  ${charAction.char.name}이(가) 보스에게 ${charAction.finalPower}의 공격을 가했습니다. (보스 방어 ${finalBossDefense} 적용 후) ${damageDealt}의 피해를 입혔습니다.\n`;
        }
    });
    currentBossHP = Math.max(0, currentBossHP - totalDamageToBoss);
    summaryBossDamageTaken += totalDamageToBoss; // 플레이어가 보스에게 입힌 피해도 합산

    if (totalDamageToBoss > 0) {
        resultDiv.innerHTML += `** 보스에게 입힌 총 피해: ${totalDamageToBoss}**\n`;
    } else {
        resultDiv.innerHTML += `** 이번 턴 보스에게 입힌 피해는 없습니다.**\n`;
    }


    // 6. 버프/디버프 턴 감소 및 종료 처리
    let removedBuffs = [];
    participatingCharacters.forEach(char => {
        char.status.buffs = char.status.buffs.filter(buff => {
            buff.remainingTurns--;
            if (buff.remainingTurns <= 0) {
                calcDetails.innerHTML += `${char.name}의 ${buff.type} 버프가 종료되었습니다.\n`;
                removedBuffs.push({ char: char.name, type: buff.type });
                // 검은 피 종료 시 체력 정산 (원래 MaxHP로 돌아옴)
                if (buff.type === 'blackBlood') {
                    char.status.maxHP = char.status.originalMaxHP; // 원래 최대 체력으로 복귀
                    char.status.currentHP = Math.min(char.status.currentHP, char.status.maxHP); // 현재 체력이 늘어난 MaxHP보다 높으면 조정
                    calcDetails.innerHTML += `${char.name}의 체력이 [검은 피] 종료로 인해 조정되었습니다. (현재: ${char.status.currentHP}/${char.status.maxHP})\n`;
                }
                return false;
            }
            return true;
        });
    });
    if (removedBuffs.length > 0) {
        resultDiv.innerHTML += `\n--- 버프/디버프 종료 ---\n`;
        removedBuffs.forEach(rb => {
            let buffTypeName = rb.type;
            if (rb.type === 'soulResonance') buffTypeName = '영혼의 공명';
            else if (rb.type === 'blackBlood') buffTypeName = '검은 피';
            else if (rb.type === 'attackDown') buffTypeName = '공격력 감소';
            else if (rb.type === 'defenseDown') buffTypeName = '방어력 감소';
            else if (rb.type === 'disableTalents') buffTypeName = '재능 사용 불가';
            else if (rb.type === 'incapacitated') buffTypeName = '행동 불능';
            resultDiv.innerHTML += ` - ${rb.char}의 [${buffTypeName}] 효과가 종료되었습니다.\n`;
        });
    }

    // 7. 최종 결과 출력
    // 새로운 코드 (수정 후)
    resultDiv.innerHTML += `\n=== 턴 ${turn} 결과 ===\n`;
    resultDiv.innerHTML += `**${boss.name} 잔여 HP: ${currentBossHP}**\n\n`;

    // --- 캐릭터 최종 상태 요약 추가 ---
    resultDiv.innerHTML += `\n--- 캐릭터 최종 상태 ---\n`;
    participatingCharacters.forEach(char => {
        updateCharacterStatusUI(char); // 최신 상태로 UI 업데이트 (HP, 공명률, 광기 등)
        resultDiv.innerHTML += `**${char.name}** | HP: ${char.status.currentHP}/${char.status.maxHP} | 공명률: ${char.status.resonance}%`;

        // 광기 정보 추가
        if (char.talents.includes('광') || char.talents.includes('악')) {
            let madnessStatusText = `광기: ${char.status.madness}%`;
            if (char.traits.includes('분노')) {
                madnessStatusText += ` (면역)`; // '분노' 천성일 경우 광기 옆에 '(면역)' 표시
            }
            resultDiv.innerHTML += ` | ${madnessStatusText}`;
        }

        // 최종 위력 계수 정보 추가
        const charActionForTurn = charActions.find(action => action.char.name === char.name);
        if (charActionForTurn && charActionForTurn.finalPower !== undefined && (charActionForTurn.action === 'attack' || charActionForTurn.action === 'defense')) {
            let actionType = charActionForTurn.action === 'attack' ? '공격' : '방어';
            resultDiv.innerHTML += ` | 최종 ${actionType} 계수: ${charActionForTurn.finalPower.toFixed(2)}`; // 소수점 두 자리까지 표시
        }

        // 활성화된 버프 정보도 함께 표시
        if (char.status.buffs.length > 0) {
            const activeBuffs = char.status.buffs.map(b => {
                let buffText = b.type;
                if (b.type === 'soulResonance') buffText = '영혼의 공명';
                else if (b.type === 'blackBlood') buffText = '검은 피';
                else if (b.type === 'attackDown') buffText = '공격력 감소';
                else if (b.type === 'defenseDown') buffText = '방어력 감소';
                else if (b.type === 'disableTalents') buffText = '재능 사용 불가';
                else if (b.type === 'incapacitated') buffText = '행동 불능';
                if (b.remainingTurns !== undefined) {
                    buffText += `(${b.remainingTurns}턴)`;
                }
                return buffText;
            }).join(', ');
            resultDiv.innerHTML += ` | 버프: ${activeBuffs}`;
        }
        resultDiv.innerHTML += `\n`; // 각 캐릭터 정보 줄바꿈
    });

    if (currentBossHP <= 0) {
        resultDiv.innerHTML += `\n-- ${boss.name}를 처치하였습니다. 전투 승리. --`;
        document.getElementById('calculateTurnBtn').disabled = true;
    } else if (participatingCharacters.every(c => c.status.currentHP <= 0)) {
        resultDiv.innerHTML += `\n-- 모든 캐릭터가 전투 불능이 되었습니다. 전투 패배. --`;
        document.getElementById('calculateTurnBtn').disabled = true;
    }

    turn++;
}

// 계산 과정 토글
document.getElementById('toggleDetailsBtn').addEventListener('click', () => {
    const div = document.getElementById('calcDetails');
    div.style.display = div.style.display === 'none' ? 'block' : 'none';
});