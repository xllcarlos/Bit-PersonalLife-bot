import { getGeminiClient } from "./client";
import { config } from "../config";
import { BusySlot } from "../google/calendar";

export interface ScheduledProposal {
  title: string;
  suggestedStart: string; // ISO 8601
  suggestedEnd: string; // ISO 8601
  durationMinutes: number;
  rationale: string;
  transcribedText?: string;
}

export async function analyzeAndScheduleInput(params: {
  text?: string;
  audioBase64?: string;
  audioMimeType?: string;
  currentIsoTime: string;
  busySlots: BusySlot[];
}): Promise<ScheduledProposal> {
  const genAI = getGeminiClient();
  const model = genAI.getGenerativeModel({
    model: config.gemini.model,
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.2,
    },
  });

  const prompt = `
Você é o Assistente Racional de Gestão de Agenda do Carlos.
O Carlos utiliza o Notion Calendar sincronizado com o Google Calendar. Ele precisa que você analise seus compromissos reais atuais e encontre a melhor janela livre para alocar uma nova tarefa ou compromisso.

DADOS TEMPORAIS ATUAIS:
- Data e Hora Atual: ${params.currentIsoTime}
- Fuso Horário de Referência: ${config.scheduler.timeZone} (UTC-03:00)

HORÁRIOS EFETIVAMENTE OCUPADOS NA AGENDA DO CARLOS (GROUND TRUTH):
(Estes são os eventos reais puxados da agenda dele para os próximos 14 a 21 dias. Não invente horários fixos; use estritamente esta lista e o bom senso para horários de descanso).
${JSON.stringify(params.busySlots, null, 2)}

DIRETRIZES DE ENCAIXE INTELIGENTE:
1. Fonte da Verdade:
   - A agenda real acima é a sua única restrição rígida de compromissos. Se o Carlos mudou ou arrastou um evento (como academia ou laboratório), respeite o horário que está na lista acima.
   - Não agende tarefas durante a madrugada (janela de sono padrão entre 23:00 e 06:30), a menos que o Carlos peça explicitamente.
2. Análise de Prazos e Períodos:
   - O Carlos pode pedir para agendar para "amanhã", "depois de amanhã", "na próxima semana", "quinta que vem" ou "até o fim da semana que vem".
   - Identifique com precisão qual dia e período ele solicitou e procure uma janela livre nesse intervalo.
   - Se o usuário não especificou quando, procure a próxima janela livre equilibrada no horário diurno (entre 08:00 e 20:30).
3. Margem de Respiro (Anti-Tetris):
   - NUNCA sobreponha um horário já ocupado.
   - Deixe sempre uma margem de folga de 15 a 30 minutos entre eventos para que a rotina seja sustentável e humana.
4. Racional:
   - Explique brevemente por que aquele horário e dia foram escolhidos em relação aos outros compromissos dele.

FORMATO OBRIGATÓRIO DE RESPOSTA (JSON puro):
{
  "title": "Nome claro da tarefa ou evento",
  "suggestedStart": "YYYY-MM-DDTHH:mm:ss-03:00",
  "suggestedEnd": "YYYY-MM-DDTHH:mm:ss-03:00",
  "durationMinutes": 60,
  "rationale": "Explicação em português de por que esse horário se encaixa perfeitamente",
  "transcribedText": "Transcrição do áudio (se a entrada foi áudio)"
}
`;

  const contents: any[] = [{ text: prompt }];

  if (params.audioBase64) {
    contents.push({
      inlineData: {
        mimeType: params.audioMimeType || "audio/ogg",
        data: params.audioBase64,
      },
    });
    contents.push({
      text: "Ouça o áudio do Carlos, transcreva-o e encontre o melhor encaixe racional na agenda dele conforme o JSON especificado.",
    });
  } else if (params.text) {
    contents.push({
      text: `Solicitação do Carlos:\n"${params.text}"`,
    });
  } else {
    throw new Error("Nenhum texto ou áudio fornecido para análise.");
  }

  const modelsToTry = [
    config.gemini.model,
    ...(config.gemini.fallbackModels || []),
  ];

  let responseText = "";
  let lastError: any = null;

  for (const modelName of modelsToTry) {
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.2,
      },
    });

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const response = await model.generateContent(contents);
        responseText = response.response.text();
        lastError = null;
        break;
      } catch (err: any) {
        lastError = err;
        console.warn(
          `Tentativa ${attempt} no modelo ${modelName} falhou:`,
          err?.message || err
        );

        if (
          attempt < 2 &&
          (err?.message?.includes("503") ||
            err?.message?.includes("429") ||
            err?.message?.includes("high demand"))
        ) {
          await new Promise((resolve) => setTimeout(resolve, 1500));
        } else {
          break; // Tenta o próximo modelo do fallback
        }
      }
    }

    if (responseText) {
      break;
    }
  }

  if (!responseText) {
    throw lastError || new Error("Falha ao se comunicar com os modelos do Gemini.");
  }

  try {
    return JSON.parse(responseText) as ScheduledProposal;
  } catch (err) {
    console.error("Falha ao analisar JSON do Gemini:", responseText);
    throw new Error("O Gemini retornou um formato inesperado. Tente novamente.");
  }
}
