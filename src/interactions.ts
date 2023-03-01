import {
    APIApplicationCommandInteraction,
    APIChatInputApplicationCommandInteractionData,
    APIApplicationCommandInteractionDataStringOption,
} from 'discord-api-types/v10';

import { Env } from '.'

// discord stuff
const DISCORD_API_ENDPOINT = "https://discord.com/api/v10";

// google doc shortcut testing
const docmap = new Map<string, string>([
    ["1079577609626730576", "1BlIKPpwyRWTVaJwnx4JgIyjTuVJTpG7qNruOssEaB3U"], // 00
    ["1079586450716246066", "1IL8pC54CZLJ-xHGE_W-KGOaH8HXPg37JZESN2r9atcU"], // 01
    ["1079586472178503721", "1CoWxwrd7QgdUAK5k3LI0T-rnYdN6A3ZG-Z7KPVHnlAI"], // 02
]);

async function oai_complete(prompt: string, key: string) {
    const url = 'https://api.openai.com/v1/completions';
    const options = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${key}`
        },
        body: JSON.stringify({
            prompt: prompt,
            max_tokens: 256,
            model: "text-davinci-003",
            temperature: 0.8,
        })
    };
    const response = await fetch(url, options);
    return await response.json();
}

type OAIChatMessage = { "role": "system" | "user" | "assistant", "content": string }
type OAIChatUsage = { "prompt_tokens": number, "completion_tokens": number, "total_tokens": number };
type OAIChatChoice = { "message": OAIChatMessage, "finish_reason": string, "index": number }
type OAIChatCompletion = { "id": string, "object": string, "created": number, "model": string, "usage": OAIChatUsage, "choices": OAIChatChoice[] }
async function oai_chat(messages: OAIChatMessage[], key: string): Promise<OAIChatCompletion> {
    const url = "https://api.openai.com/v1/chat/completions";
    const options = {
        method: "POST",
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${key}`
        },
        body: JSON.stringify({
            messages,
            model: "gpt-3.5-turbo"
        })
    };
    const response = await fetch(url, options);
    return await response.json();
}

async function gdoc_preamble(docid: string): Promise<string> {
    // for easy testing just edit this google doc link
    const url = `https://docs.google.com/document/d/${docid}/export?format=txt`;
    // ------------------------------------------------------------------------
    const response = await fetch(url, {
        headers: {
            "content-type": "application/json;charset=UTF-8",
        },
    });
    const { headers } = response;
    const contentType = headers.get("content-type") || ""
    if (contentType.includes("application/json")) {
        return JSON.stringify(await response.json())
    } else {
        return response.text();
    }
}

export async function handle(interaction: APIApplicationCommandInteraction, env: Env): Promise<any> {
    const kvmap = new Map<string, KVNamespace>([
        ["1079160854211207208", env.TREACHEROUS],
        ["1079577609626730576", env.DOC_00],
        ["1079586450716246066", env.DOC_01],
        ["1079586472178503721", env.DOC_02],
    ])

    if (!interaction.member) {
        // todo: what interactions don't have a member field?
        return fetch(`${DISCORD_API_ENDPOINT}/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`, {
            method: 'PATCH',
            headers: {
                'content-type': 'application/json;charset=UTF-8',
            },
            body: JSON.stringify({ content: '???' })
        });
    }

    const cmd = interaction.data as APIChatInputApplicationCommandInteractionData;
    var username = interaction.member.user.username;
    let kv = kvmap.get(interaction.channel_id)!;

    switch (cmd.name) {
        // --------------------------------------------------------------------
        // action
        // --------------------------------------------------------------------
        case "a": {
            let options = cmd.options!;
            let action = (options[0] as APIApplicationCommandInteractionDataStringOption).value;
            let said = options.length > 1 ? (options[1] as APIApplicationCommandInteractionDataStringOption).value : "";
            let optional_said = options.length > 1 ? ` and said "${said}" while doing so` : "";

            // -------------------------------------------------------------------------------
            // pre-completion
            // -------------------------------------------------------------------------------
            let preamble;
            // let events: string[] = [];
            let result: string;
            if (docmap.has(interaction.channel_id)) {
                preamble = await gdoc_preamble(docmap.get(interaction.channel_id)!);
                let prompt = `${preamble}
                
                A player named ${username} has just performed an action: ${action}${optional_said}.
                
                DM: `
                // -------------------------------------------------------------------------------
                // completion
                // -------------------------------------------------------------------------------
                const completion = await oai_complete(prompt, env.OPENAI_SECRET) as {
                    choices: [
                        { text: string }
                    ]
                };
                result = completion.choices[0].text.trim();
            } else {
                let historyString = await kv.get("events");
                let history: OAIChatMessage[];
                if (historyString !== null) {
                    history = JSON.parse(historyString);
                } else {
                    let systemDescription = `You are the dungeon master of a fantasy roleplaying game called "A Long and Treacherous Journey". Players will send you their actions and you will respond with a description of how the environment changed as a result. This can include physical changes to the environment, physical changes to the player characters, and reactions from non-player characters. Player characters are not precious, it is acceptable for them to get wounded or even killed off. In such an event, a new character should be introduce for the player to control.`
                    let start: OAIChatMessage = { "role": "system", "content": systemDescription };
                    history = [start];
                }
                history.push({ "role": "user", "content": `${action}${said.length > 0 ? `, "${said}"` : ""}` });
                // -------------------------------------------------------------------------------
                // completion
                // -------------------------------------------------------------------------------
                const completion = await oai_chat(history, env.OPENAI_SECRET);
                history.push(completion.choices[0].message);
                await kv.put("events", JSON.stringify(history));
                result = history[history.length - 1].content;
            }

            let response = `${username}: [${action}] ${said ? `"${said}"` : ""}
            ${result}`;

            // todo: it's interesting that we can do a whole host of behaviors here, not just editing the pending response (e.g. create chat channels, append emoji, change player names, etc)
            return fetch(`${DISCORD_API_ENDPOINT}/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`, {
                method: 'PATCH',
                headers: {
                    'content-type': 'application/json;charset=UTF-8',
                },
                body: JSON.stringify({ content: response })
            });
        }
        // --------------------------------------------------------------------
        // journal
        // --------------------------------------------------------------------
        case 'j': {
            await fetch(`${DISCORD_API_ENDPOINT}/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`, {
                method: 'PATCH',
                headers: {
                    'content-type': 'application/json;charset=UTF-8',
                },
                body: JSON.stringify({ content: "Checking the journal..." })
            });
            let events: OAIChatMessage[] = JSON.parse(await kv.get('events') ?? "[]");
            let message = "Checking the journal..."
            let recent = events.slice(-5);
            if (recent.length > 0) {
                let filtered = recent.filter(v => v.role === "assistant");
                let bulleted = filtered.map(v => `* ${v.content}`);
                message = `${message}\n${bulleted.join('\n')}`;
            } else {
                message = `${message} but no entries were found!`;
            }
            return fetch(`${DISCORD_API_ENDPOINT}/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`, {
                method: 'PATCH',
                headers: {
                    'content-type': 'application/json;charset=UTF-8',
                },
                body: JSON.stringify({ content: message, flags: 1 << 6 })
            });
        }
        default: break;
    }
}
