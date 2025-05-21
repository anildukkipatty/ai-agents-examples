
import { tool } from "@langchain/core/tools";
import { addMessages, Command, entrypoint, interrupt, MemorySaver, task } from "@langchain/langgraph";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import {config} from "dotenv";
import { isBaseMessage } from "@langchain/core/messages";
// Load environment variables from .env file
config();

// Tool for getting travel recommendations
const getTravelRecommendations = tool(async () => {
  const destinations = ["aruba", "turks and caicos"];
  return destinations[Math.floor(Math.random() * destinations.length)];
}, {
  name: "getTravelRecommendations",
  description: "Get recommendation for travel destinations",
  schema: z.object({}),
});

// Tool for getting hotel recommendations
const getHotelRecommendations = tool(async (input) => {
  const recommendations = {
    "aruba": [
      "The Ritz-Carlton, Aruba (Palm Beach)",
      "Bucuti & Tara Beach Resort (Eagle Beach)"
    ],
    "turks and caicos": ["Grace Bay Club", "COMO Parrot Cay"]
  };
  return recommendations[input.location];
}, {
  name: "getHotelRecommendations",
  description: "Get hotel recommendations for a given destination.",
  schema: z.object({
    location: z.enum(["aruba", "turks and caicos"])
  }),
});

// Define a tool to signal intent to hand off to a different agent
// Note: this is not using Command(goto) syntax for navigating to different agents:
// `workflow()` below handles the handoffs explicitly
const transferToHotelAdvisor = tool(async () => {
  return "Successfully transferred to hotel advisor";
}, {
  name: "transferToHotelAdvisor",
  description: "Ask hotel advisor agent for help.",
  schema: z.object({}),
  // Hint to our agent implementation that it should stop
  // immediately after invoking this tool 
  returnDirect: true,
}); 

const transferToTravelAdvisor = tool(async () => {
  return "Successfully transferred to travel advisor";
}, {
  name: "transferToTravelAdvisor", 
  description: "Ask travel advisor agent for help.",
  schema: z.object({}),
  // Hint to our agent implementation that it should stop
  // immediately after invoking this tool
  returnDirect: true,
});

const model = new ChatOpenAI({
  modelName: "gpt-4o",
  temperature: 0,
});

const travelAdvisorTools = [
    getTravelRecommendations,
    transferToHotelAdvisor,
  ];

const travelAdvisor = createReactAgent({
  llm: model,
  tools: travelAdvisorTools,
  stateModifier: [
    "You are a general travel expert that can recommend travel destinations (e.g. countries, cities, etc).",
    "If you need hotel recommendations, ask 'hotel_advisor' for help.",
    "You MUST include human-readable response before transferring to another agent.",
  ].join(" ")
});

const callTravelAdvisor = task("callTravelAdvisor", async (messages) => {
    const response = await travelAdvisor.invoke({ messages });
    return response.messages;
});


const hotelAdvisorTools = [
    getHotelRecommendations,
    transferToTravelAdvisor,
];

const hotelAdvisor = createReactAgent({
    llm: model,
    tools: hotelAdvisorTools,
    stateModifier: [
      "You are a hotel expert that can provide hotel recommendations for a given destination.",
      "If you need help picking travel destinations, ask 'travel_advisor' for help.",
      "You MUST include a human-readable response before transferring to another agent."
    ].join(" "),
});

const callHotelAdvisor = task("callHotelAdvisor", async (messages) => {
    const response = await hotelAdvisor.invoke({ messages });
    return response.messages;
  });

const checkpointer = new MemorySaver();

const multiTurnGraph = entrypoint({
    name: "multiTurnGraph",
    checkpointer,
  }, async (messages) => {  
    let callActiveAgent = callTravelAdvisor;
    let agentMessages;
    let currentMessages = messages;
    while (true) {
      agentMessages = await callActiveAgent(currentMessages);
  
      // Find the last AI message
      // If one of the handoff tools is called, the last message returned
      // by the agent will be a ToolMessages because we set them to have
      // "returnDirect: true". This means that the last AIMessage will
      // have tool calls.
      // Otherwise, the last returned message will be an AIMessage with
      // no tool calls, which means we are ready for new input.
      const reversedMessages = [...agentMessages].reverse();
      const aiMsgIndex = reversedMessages
        .findIndex((m) => m.getType() === "ai");
  
      const aiMsg = reversedMessages[aiMsgIndex];
  
      // We append all messages up to the last AI message to the current messages.
      // This may include ToolMessages (if the handoff tool was called)
      const messagesToAdd = reversedMessages.slice(0, aiMsgIndex + 1).reverse();
  
      // Add the agent's responses
      currentMessages = addMessages(currentMessages, messagesToAdd);
  
      if (!aiMsg?.tool_calls?.length) {
        const userInput = await interrupt("Ready for user input.");
        if (typeof userInput !== "string") {
          throw new Error("User input must be a string.");
        }
        if (userInput.toLowerCase() === "done") {
          break;
        }
        currentMessages = addMessages(currentMessages, [{
          role: "human",
          content: userInput,
        }]);
        continue;
      }
  
      const toolCall = aiMsg.tool_calls.at(-1);
      if (toolCall.name === "transferToHotelAdvisor") {
        callActiveAgent = callHotelAdvisor;
      } else if (toolCall.name === "transferToTravelAdvisor") {
        callActiveAgent = callTravelAdvisor;
      } else {
        throw new Error(`Expected transfer tool, got '${toolCall.name}'`);
      }
    }
  
    return entrypoint.final({
      value: agentMessages[agentMessages.length - 1],
      save: currentMessages,
    });
  });


const threadConfig = {
    configurable: { 
        thread_id: "123456"
    },
    streamMode: "updates",
};

const inputs = [
    // 1st round of conversation
    [{ role: "user", content: "i wanna go somewhere warm in the caribbean" }],
    // Since we're using `interrupt`, we'll need to resume using the Command primitive
    // 2nd round of conversation
    new Command({
      resume: "could you recommend a nice hotel in one of the areas and tell me which area it is."
    }),
    // 3rd round of conversation
    new Command({
      resume: "i like the first one. could you recommend something to do near the hotel?"
    })
  ];

  const runConversation = async () => {
    for (const [idx, userInput] of inputs.entries()) {
      console.log();
      console.log(`--- Conversation Turn ${idx + 1} ---`);
      console.log();
      console.log(`User: ${JSON.stringify(userInput, null, 2)}`);
      console.log();
  
      const stream = await multiTurnGraph.stream(
        userInput,
        threadConfig,
      );
  
      for await (const update of stream) {
        if (update.__metadata__?.cached) {
          continue;
        }
        for (const [nodeId, value] of Object.entries(update)) {
          if (Array.isArray(value) && value.length > 0) {
            const lastMessage = value.at(-1);
            if (isBaseMessage(lastMessage) && lastMessage?.getType() === "ai") {
              console.log(`${nodeId}: ${lastMessage.content}`);
            }
          }
        }
      }
    }
  };
  
  // Execute the conversation
  try {
    await runConversation();
  } catch (e) {
    console.error(e);
  }