import {
    APIApplicationCommandInteraction,
    APIChatInputApplicationCommandInteractionData,
    APIApplicationCommandInteractionDataStringOption,
    InteractionResponseType,
    MessageFlags,
} from 'discord-api-types/v10';

import { Env } from '.'

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
            max_tokens: 16,
            model: "text-davinci-003",
            temperature: 0,
        })
    };
    const response = await fetch(url, options);
    return await response.json();
}

export async function handle(interaction: APIApplicationCommandInteraction, env: Env): Promise<any> {
    let resp = {};
    if (!interaction.member) {
        // todo: what interactions don't have a member field?
        return {
            type: InteractionResponseType.ChannelMessageWithSource, data: {
                flags: MessageFlags.Ephemeral,
                content: `???`
            }
        };
    }

    const cmd = interaction.data as APIChatInputApplicationCommandInteractionData;
    var username = interaction.member.user.username;

    switch (cmd.name) {
        // https://discord.com/developers/docs/resources/channel#message-object-message-flags
        case "say": {
            let options = cmd.options;
            let first = options![0] as APIApplicationCommandInteractionDataStringOption;
            let said = first.value;
            let prompt = `
            Please complete the following as if you were the DM of a roleplaying campaign set in a fantasy world. 
            
            The players will describe their actions and you will describe the events that follow, including changes to the environment and reactions from other characters.
            
            A player just said: "${said}".`
            const completion = await oai_complete(prompt, env.OPENAI_SECRET) as {
                choices: [
                    { text: string }
                ]
            };
            resp = {
                type: 4, data: {
                    content: `
                    ${username} mutters, "${said}".
                    ${completion.choices[0].text}`
                }
            };
            break;
        }
        default: break;
    }
    return resp;
}
