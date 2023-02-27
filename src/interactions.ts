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
            let events: string[] = []
            if (docmap.has(interaction.channel_id)) {
                preamble = await gdoc_preamble(docmap.get(interaction.channel_id)!);
            } else {
                // todo Promise.all
                let playerState = await kv.get(interaction.member.user.id) ?? JSON.stringify({ name: "", health: 0.99, hunger: 0.01, despair: 0.01, location: "" });
                let eventString = await kv.get("events") ?? "[\"our story begins\"]";
                events = JSON.parse(eventString);
                // todo: string replacement tokens for use in the google doc? e.g. __PLAYER_STATE__, __EVENT_HISTORY__
                preamble = `The following is a vivid accounting of events, as described by a dungeon master, of a fantasy roleplaying campaign called "A Long and Treacherous Journey".

Each description is followed by the string "---", then the updated state of the player JSON, another "---", and then a short, one-sentence summary of major events (if any).

The previous state of the player was: ${playerState}

Events leading up to this: ${events.join(',')}
`;
            }

            // -------------------------------------------------------------------------------
            // completion
            // -------------------------------------------------------------------------------
            let prompt = `${preamble}
            
            A player named ${username} has just performed an action: ${action}${optional_said}.
            
            DM: `
            const completion = await oai_complete(prompt, env.OPENAI_SECRET) as {
                choices: [
                    { text: string }
                ]
            };
            let result = completion.choices[0].text.trim();

            // -------------------------------------------------------------------------------
            // post-completion
            // -------------------------------------------------------------------------------
            if (!docmap.has(interaction.channel_id)) {
                let [description, update, eventSummary] = result.split('---');
                result = description;

                // try to find something that looks like a json object:
                const start = update.indexOf('{');
                let idx = start;
                if (idx > -1) {
                    let count = 1;
                    while (count > 0) {
                        idx += 1;
                        let chr = update.charAt(idx);
                        if (chr === "{") { count += 1; }
                        if (chr === "}") { count -= 1; }
                    }

                    try {
                        let stringy = update.substring(start, idx + 1);
                        console.log(stringy);
                        let obj = JSON.parse(stringy);
                        await kv.put(interaction.member.user.id, JSON.stringify(obj));
                    } catch { console.log("failed to parse user json") }
                }

                // check to see if we have a new event to append
                if (eventSummary && eventSummary.trim()) {
                    let latestEvent = eventSummary.trim();
                    console.log(latestEvent);
                    events.push(latestEvent);
                    await kv.put("events", JSON.stringify(events));
                }
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
            let events: string[] = JSON.parse(await kv.get('events') ?? "[]");
            let message = "Checking the journal..."
            let recent = events.slice(-5);
            if (recent.length > 0) {
                let bulleted = recent.map(v => `* ${v}`);
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
