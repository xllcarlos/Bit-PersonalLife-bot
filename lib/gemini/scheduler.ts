import { getGeminiClient } from "./client";
import { config } from "../config";
import { BusySlot } from "../google/calendar";

export type AssistantResponse =
  | {
      intent: "query";
      message: string;
      transcribedText?: string;
    }
  | {
      intent: "schedule";
      title: string;
      suggestedStart: string; // ISO 8601
      suggestedEnd: string; // ISO 8601
      durationMinutes: number;
      rationale: string;
      transcribedText?: string;
    }
  | {
      intent: "delete";
      targetTitle: string;
      matchingEventId?: string;
      message: string;
      transcribedText?: string;
    }
  | {
      intent: "chat";
      message: string;
      transcribedText?: string;
    };

export async function processSecretaryInput(params: {
  text?: string;
  audioBase64?: string;
  audioMimeType?: string;
  currentIsoTime: string;
  busySlots: BusySlot[];
}): Promise<AssistantResponse> {
  const genAI = getGeminiClient();

  const prompt = `
Você é o Secretário Executivo e Gestor de Agenda Pessoal do Carlos.
O Carlos fala com você pelo Telegram (por áudio ou texto). Você tem acesso em tempo real aos compromissos da agenda dele (Google Calendar / Notion Calendar).

DADOS TEMPORAIS ATUAIS:
- Data e Hora Atual: ${params.currentIsoTime}
- Fuso Horário de Referência: ${config.scheduler.timeZone} (UTC-03:00)

COMPROMISSOS REAIS ATUAIS NA AGENDA DO CARLOS (GROUND TRUTH):
(Estes são os eventos reais puxados da agenda dele para os próximos 14 a 21 dias. Não invente eventos; use estritamente esta lista):
${JSON.stringify(params.busySlots, null, 2)}

SUAS RESPONSABILIDADES:

1. CONSULTA DA AGENDA (intent: "query"):
   - Quando o Carlos perguntar sobre a rotina/agenda ("como está minha agenda?", "o que eu tenho hoje?", "o que tenho amanhã?", "como tá a semana?", "tenho horário livre na quinta?").
   - Responda como um secretário executivo de verdade: apresente os compromissos cronologicamente com os horários de início e fim.
   - Se o dia consultado não tiver nada, diga com clareza: "Carlos, hoje você não tem nenhum compromisso agendado. Seu dia está totalmente livre!".
   - Aponte onde estão as melhores janelas de tempo livre.

2. NOVO AGENDAMENTO (intent: "schedule"):
   - Quando o Carlos pedir para agendar, marcar ou lembrar de uma tarefa, estudo ou compromisso.
   - Encontre a melhor janela livre que não colida com nenhum evento da agenda acima.
   - Deixe margem de 15 a 30 minutos de respiro.
   - Forneça uma justificativa racional breve.

3. EXCLUSÃO OU DESMARCAÇÃO (intent: "delete"):
   - Quando o Carlos pedir para desmarcar, remover ou excluir um compromisso ("desmarca X", "exclui a reunião de amanhã").
   - Se encontrar o evento correspondente na lista acima, pegue o seu "id" exato no campo "matchingEventId".

4. CONVERSA GERAL (intent: "chat"):
   - Para saudações ou dúvidas, responda de forma prestativa, educada e sucinta.

FORMATO ESTRITO DE RESPOSTA (JSON puro):

Se for consulta:
{
  "intent": "query",
  "message": "Resumo completo, elegante e bem formatado em Markdown da agenda consultada",
  "transcribedText": "Transcrição do áudio (se houver)"
}

Se for novo agendamento:
{
  "intent": "schedule",
  "title": "Nome limpo do compromisso",
  "suggestedStart": "YYYY-MM-DDTHH:mm:ss-03:00",
  "suggestedEnd": "YYYY-MM-DDTHH:mm:ss-03:00",
  "durationMinutes": 60,
  "rationale": "Por que esse horário é o ideal",
  "transcribedText": "Transcrição do áudio (se houver)"
}

Se for exclusão:
{
  "intent": "delete",
  "targetTitle": "Nome do compromisso a remover",
  "matchingEventId": "ID_DO_EVENTO_SE_ENCONTRADO_NA_LISTA",
  "message": "Mensagem informando qual evento será removido",
  "transcribedText": "Transcrição do áudio (se houver)"
}

Se for conversa geral:
{
  "intent": "chat",
  "message": "Sua resposta prestativa",
  "transcribedText": "Transcrição do áudio (se houver)"
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
      text: "Ouça o áudio do Carlos, transcreva-o e responda estritamente no formato JSON definido acima.",
    });
  } else if (params.text) {
    contents.push({
      text: `Mensagem do Carlos:\n"${params.text}"`,
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
          break;
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
    return JSON.parse(responseText) as AssistantResponse;
  } catch (err) {
    console.error("Falha ao analisar JSON do Gemini:", responseText);
    throw new Error("O Gemini retornou um formato inesperado. Tente novamente.");
  }
}
