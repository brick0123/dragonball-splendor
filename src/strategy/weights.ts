// 전략 가중치(STRATEGY.md §2.3 권장 시작점). 튜닝 대상.
export const WEIGHTS = {
  pts: 1.0, // 점수 가치
  bonus: 0.6, // 보너스 할인 가치
  evo: 1.5, // 진화 연결 가치
  goal: 0.5, // 목표 테크 정렬
  cost: 1.0, // 획득 비용 패널티
  tiebreak: 0.4, // 진화 tie-breaker
  reserve: 0.45, // 보관 시 V_card 감쇄(즉시 효과 아님)
  master: 0.8, // 궁극의 드래곤볼 획득 가치
  blind: 0.15, // 비공개 보관 기댓값
};

/** 몬테카를로 사용자 정책 소프트선택 폭. */
export const USER_TOP_K = 3;
/** 소프트맥스 온도(높을수록 균등). */
export const USER_SOFTMAX_TEMP = 0.6;
