import {
    APIApplicationCommandInteraction,
    APIChatInputApplicationCommandInteractionData,
    APIApplicationCommandInteractionDataStringOption,
    APITextChannel,
    APIChannel,
    APIGuildCategoryChannel,
    ChannelType,
    APIGuild,
} from 'discord-api-types/v10';

import { Env } from '.'

// discord stuff
const DISCORD_API_ENDPOINT = "https://discord.com/api/v10";

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
    return response.json();
}
// `${DISCORD_API_ENDPOINT}/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`
async function oai_chat_streaming(messages: OAIChatMessage[], stub: string, patchURL: string, key: string): Promise<OAIChatMessage> {
    const url = "https://api.openai.com/v1/chat/completions";
    const options = {
        method: "POST",
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${key}`
        },
        body: JSON.stringify({
            messages,
            model: "gpt-3.5-turbo",
            stream: true
        })
    };
    return new Promise<OAIChatMessage>(async (resolve, reject) => {
        const response = await fetch(url, options);
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        const stream = new ReadableStream({
            start(controller) {
                let committed: string = "";
                let updated: string = "";
                let chunk: string;
                // const interval = setInterval(() => , 1000);
                return pump();
                function pump(): any {
                    return reader.read().then(async ({ done, value }) => {
                        // When no more data needs to be consumed, close the stream
                        if (done) {
                            controller.close();
                            await fetch(patchURL, {
                                method: 'PATCH',
                                headers: {
                                    'content-type': 'application/json;charset=UTF-8',
                                },
                                body: JSON.stringify({ content: `${stub}\n${updated}` })
                            })
                            resolve({ role: "assistant", content: updated });
                            return;
                        }

                        let sliceStart;
                        let bit = decoder.decode(value);
                        chunk += bit;
                        for (const m of chunk.matchAll(/data: ({.*})/g)) {
                            const dat = JSON.parse(m[1]);
                            const delta = dat.choices[0].delta;
                            if (delta.content) {
                                updated += delta.content;
                            }
                            // console.log(dat.choices[0].delta);
                            sliceStart = m.index! + m[0].length;
                        }
                        if (updated.length - committed.length > 64) {
                            await fetch(patchURL, {
                                method: 'PATCH',
                                headers: {
                                    'content-type': 'application/json;charset=UTF-8',
                                },
                                body: JSON.stringify({ content: `${stub}\n${updated}` })
                            });
                            committed = updated;
                        }
                        chunk = chunk.slice(sliceStart).trim();
                        // console.log(`remaining chunk: ${chunk}`);

                        // Enqueue the next data chunk into our target stream
                        controller.enqueue(value);
                        return pump();
                    });
                }
            },
        });
    });
}

type OAIImageData = { url: string }
type OAIImageGenerationResponse = { created: number, data: OAIImageData[] }

async function oai_image(prompt: string, key: string): Promise<OAIImageGenerationResponse> {
    const url = "https://api.openai.com/v1/images/generations";
    const options = {
        method: "POST",
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${key}`
        },
        body: JSON.stringify({
            prompt,
            size: "256x256"
        })
    };
    const response = await fetch(url, options);
    return response.json();
}

type CampaignDescription = { name: string, full_description: string, short_description: string };

export async function handle(interaction: APIApplicationCommandInteraction, env: Env, ctx: ExecutionContext): Promise<any> {
    const patchURL = `${DISCORD_API_ENDPOINT}/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`;
    if (!interaction.member) {
        // todo: what interactions don't have a member field?
        return fetch(patchURL, {
            method: 'PATCH',
            headers: {
                'content-type': 'application/json;charset=UTF-8',
            },
            body: JSON.stringify({ content: '???' })
        });
    }

    const cmd = interaction.data as APIChatInputApplicationCommandInteractionData;

    switch (cmd.name) {
        // --------------------------------------------------------------------
        // action
        // --------------------------------------------------------------------
        case "a": {
            let options = cmd.options!;
            let action = (options[0] as APIApplicationCommandInteractionDataStringOption).value;
            let said = options.length > 1 ? (options[1] as APIApplicationCommandInteractionDataStringOption).value : "";

            const stub = `<@${interaction.member.user.id}>: [${action}] ${said ? `"${said}"` : ""}`
            await fetch(patchURL, {
                method: 'PATCH',
                headers: {
                    'content-type': 'application/json;charset=UTF-8',
                },
                body: JSON.stringify({ content: stub })
            });

            // -------------------------------------------------------------------------------
            // pre-completion
            // -------------------------------------------------------------------------------
            let result: string;
            let kv = env.TREACHEROUS;
            let historyString = await kv.get(`${interaction.channel_id}.events`);

            let history: OAIChatMessage[];
            if (historyString !== null) {
                history = JSON.parse(historyString);
            } else {
                // get the pre-seeded campaign description
                let campaignString = await kv.get(`${interaction.channel_id}.campaign`);
                let campaignData: CampaignDescription;
                if (campaignString !== null) {
                    campaignData = JSON.parse(campaignString);
                } else {
                    campaignData = { name: "A long and treacherous journey", short_description: "A long and treacherous journey", full_description: "A long and treacherous journey" };
                }
                // let systemDescription = `You are the dungeon master of a fantasy roleplaying game called "A Long and Treacherous Journey". Players will send you their actions and you will respond with a description of how the environment changed as a result. This can include physical changes to the environment, physical changes to the player characters, and reactions from non-player characters. Player characters are not precious, it is acceptable for them to get wounded or even killed off. In such an event, a new character should be introduce for the player to control.`
                let systemDescription = `System is the dungeon master of a highly interactive roleplaying game with the following description: "${campaignData.short_description}" 
                Players will type their actions and system will respond with a description of what happens next. 
                If the players attempt to perform difficult or skill-based actions system can ask for a d20 roll before responding. 
                System should feel comfortable challenging the players (players can get wounded and sometimes die!). 
                System can use emoji (👻🧙‍♂️💀👽☠🤖👹👺🤡😈🐸🦊🐲🐍) to spice up the descriptions. 
                All descriptions should be in the third-person ("player does X", never "you do X").`
                let start: OAIChatMessage = { role: "system", content: systemDescription };
                history = [start];
            }

            history.push({ role: "user", content: `<@${interaction.member.user.id}> performs an action: ${action}${said.length > 0 ? `, "${said}"` : ""}` });

            // -------------------------------------------------------------------------------
            // completion
            // -------------------------------------------------------------------------------
            // const completion = await oai_chat(history, env.OPENAI_SECRET);
            let completion = await oai_chat_streaming(history, stub, patchURL, env.OPENAI_SECRET);
            // console.log(`tokens: ${completion.usage.total_tokens}`);
            history.push(completion);

            result = history[history.length - 1].content;
            const hack_fakeTokenCount = history.reduce<number>((acc, msg, idx, arr) => { return acc + msg.content.length }, 0);

            // if (completion.usage.total_tokens / 4096 > 0.8) {
            // hack due to hard-to-get token count from streaming calls
            // tokens are not-quite words and the average word length in english is 4.6 characters, so, uh...
            if (hack_fakeTokenCount / (4096 * 4) > 0.8) {
                // compress history
                let summaryRequest = await oai_chat(history.concat([{ role: "user", content: "please print a summary of the story so far, starting with \"Our story so far:\"" }]), env.OPENAI_SECRET);
                console.log(`nearing context limit, requested summary: ${summaryRequest.choices[0].message.content}`);
                ctx.waitUntil(
                    fetch(`${DISCORD_API_ENDPOINT}/channels/${interaction.channel_id}/messages`, {
                        method: "POST",
                        headers: {
                            'content-type': 'application/json;charset=UTF-8',
                            Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`
                        },
                        body: JSON.stringify({
                            content: `**Interlude:**\n>>> *${summaryRequest.choices[0].message.content}*`
                        })
                    }));
                history = [history[0]].concat(summaryRequest.choices[0].message);
            }
            await kv.put(`${interaction.channel_id}.events`, JSON.stringify(history));

            let response = `${stub}\n${result}`;

            // todo: it's interesting that we can do a whole host of behaviors here, not just editing the pending response (e.g. create chat channels, append emoji, change player names, etc)
            return fetch(patchURL, {
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
            await fetch(patchURL, {
                method: 'PATCH',
                headers: {
                    'content-type': 'application/json;charset=UTF-8',
                },
                body: JSON.stringify({ content: "Checking the journal..." })
            });
            let kv = env.TREACHEROUS;
            let historyString = await kv.get(`${interaction.channel_id}.events`);
            let history: OAIChatMessage[];
            history = JSON.parse(historyString!);

            // compress history
            let summaryRequest = await oai_chat(history.concat([{ role: "user", content: "please print a summary of the story so far, starting with \"Our story so far:\"" }]), env.OPENAI_SECRET);
            ctx.waitUntil(
                fetch(`${DISCORD_API_ENDPOINT}/channels/${interaction.channel_id}/messages`, {
                    method: "POST",
                    headers: {
                        'content-type': 'application/json;charset=UTF-8',
                        Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`
                    },
                    body: JSON.stringify({
                        content: `**Journal:**\n>>> *${summaryRequest.choices[0].message.content}*`
                    })
                }));
        }
        // --------------------------------------------------------------------
        // new-campaign
        // --------------------------------------------------------------------
        case 'new-campaign': {
            let campaignUserDescription = (cmd.options![0] as APIApplicationCommandInteractionDataStringOption).value;

            let system: OAIChatMessage = { role: "system", content: "You are the designer of pen and paper roleplaying games. Users will ask you for a campaign about a topic, and you will generate the name and description of this campaign. Output should be in JSON format, with three fields: \"name\", \"full_description\", and \"short_description\"" }
            let userRequest: OAIChatMessage = { role: "user", "content": campaignUserDescription };
            const stub = `Generating a new campaign about: "_${campaignUserDescription}_"`;

            await fetch(patchURL, {
                method: 'PATCH',
                headers: {
                    'content-type': 'application/json;charset=UTF-8',
                },
                body: JSON.stringify({ content: stub, flags: 1 << 6 })
            });

            let result = await oai_chat([system, userRequest], env.OPENAI_SECRET);

            let campaignString = result.choices[0].message.content;
            let campaignData: CampaignDescription = JSON.parse(campaignString);

            // look for a category called "campaigns"
            let channelList: APIChannel[] = await (await fetch(`${DISCORD_API_ENDPOINT}/guilds/${interaction.guild_id}/channels`, {
                method: "GET",
                headers: {
                    'content-type': 'application/json;charset=UTF-8',
                    Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`
                }
            })).json();

            // categories can only hold 50
            let childCount = new Map<string, number>();
            channelList.forEach((v: APIChannel) => {
                if (v.type === ChannelType.GuildText) {
                    let test = (v as APITextChannel).parent_id ?? "0";
                    let update = childCount.get(test);
                    if (update === undefined) {
                        childCount.set(test, 1);
                    } else {
                        childCount.set(test, update + 1);
                    }
                }
            });

            let categoryCampaigns: APIGuildCategoryChannel | null = channelList.find(v => v.name?.toLowerCase() === 'campaigns') as APIGuildCategoryChannel;
            if (categoryCampaigns && childCount.get(categoryCampaigns.id) === 50) {
                // todo: create new category
                categoryCampaigns = null;
            }

            let channelCreation = await fetch(`${DISCORD_API_ENDPOINT}/guilds/${interaction.guild_id}/channels`, {
                method: "POST",
                headers: {
                    'content-type': 'application/json;charset=UTF-8',
                    Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`
                },
                body: JSON.stringify({
                    name: campaignData.name,
                    type: 0, // text
                    topic: campaignData.short_description,
                    parent_id: categoryCampaigns?.id,
                    position: 0
                })
            });
            let channel = await channelCreation.json() as APITextChannel;

            return Promise.all([
                env.TREACHEROUS.put(`${channel.id}.campaign`, campaignString),
                fetch(`${DISCORD_API_ENDPOINT}/channels/${channel.id}/messages`, {
                    method: "POST",
                    headers: {
                        'content-type': 'application/json;charset=UTF-8',
                        Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`
                    },
                    body: JSON.stringify({
                        content: campaignData.full_description.substring(0, 2000)
                    })
                }),
                fetch(`${DISCORD_API_ENDPOINT}/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`, {
                    method: 'PATCH',
                    headers: {
                        'content-type': 'application/json;charset=UTF-8',
                    },
                    body: JSON.stringify({ content: `${stub}\n<#${channel.id}> ${campaignData.short_description}`, flags: 1 << 6 })
                }),
            ])
        }
        default: break;
    }
}
