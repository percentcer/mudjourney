# this only needs to be run if you're updating commands

import requests
import os

import dotenv

dotenv.load_dotenv()

DISCORD_APP_ID = os.getenv("DISCORD_APP_ID")
DISCORD_BOT_TOKEN = os.getenv("DISCORD_BOT_TOKEN")
DISCORD_GUILD_ID = os.getenv("DISCORD_GUILD_ID")

url = f"https://discord.com/api/v10/applications/{DISCORD_APP_ID}/guilds/{DISCORD_GUILD_ID}/commands"

CHAT_INPUT = 1
USER = 2
MESSAGE = 3

# data types
T_STRING = 3

# https://discord.com/developers/docs/interactions/application-commands#slash-commands-example-slash-command
json = {
    "name": "say",
    "type": CHAT_INPUT,
    "description": "Speak friend, and enter",
    "options": [
        {
            "name": "what",
            "description": "What the player says",
            "type": T_STRING,
            "required": True,
        }
    ],
}

# For authorization, you can use either your bot token
headers = {"Authorization": f"Bot {DISCORD_BOT_TOKEN}"}

r = requests.post(url, headers=headers, json=json)
