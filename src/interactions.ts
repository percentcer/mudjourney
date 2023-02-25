import {
    APIApplicationCommandInteraction,
    APIChatInputApplicationCommandInteractionData,
    APIApplicationCommandInteractionDataStringOption,
    InteractionResponseType,
    MessageFlags,
} from 'discord-api-types/v10';

export async function handle(interaction: APIApplicationCommandInteraction): Promise<any> {
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
            resp = {
                type: 4, data: {
                    // flags: 1 << 6, 
                    content: `${username} mutters, "${said}"`
                }
            };
            break;
        }
        default: break;
    }
    return resp;
}
