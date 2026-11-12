const randInt = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;

/** Conta básica com uma resposta certa e uma "quase certa" (pra dar dúvida). */
export function generateQuestion() {
  const op = ['+', '−', '×'][randInt(0, 2)];
  let a, b, result;
  if (op === '+') { a = randInt(3, 49); b = randInt(3, 49); result = a + b; }
  else if (op === '−') { a = randInt(10, 60); b = randInt(2, a - 1); result = a - b; }
  else { a = randInt(2, 12); b = randInt(2, 12); result = a * b; }

  let wrong;
  do {
    wrong = op === '×' && Math.random() < 0.5
      ? a * (b + (Math.random() < 0.5 ? -1 : 1))
      : result + randInt(-6, 6);
  } while (wrong === result || wrong < 0);

  const correctIndex = Math.random() < 0.5 ? 0 : 1;
  const options = correctIndex === 0 ? [result, wrong] : [wrong, result];
  return { text: `${a} ${op} ${b} = ?`, options, correctIndex };
}

export const CORRECT_LINES = ['CERTA RESPOSTA!', 'O AUDITÓRIO APLAUDE!', 'GÊNIO DA MATEMÁTICA!'];
export const WRONG_LINES = ['ERROU! PRO TETO!', 'LANÇAMENTO AUTORIZADO!', 'O AUDITÓRIO VAIA!', 'TCHAU, QUERIDO!'];
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
