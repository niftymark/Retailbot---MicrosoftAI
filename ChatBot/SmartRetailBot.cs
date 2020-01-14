// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System;
using Microsoft.Bot.Builder.AI.Luis;
using Microsoft.Bot.Builder.Dialogs;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ChatBot.Dialogs;
using ChatBot.Models;
using ChatBot.Options;
using ChatBot.Services;
using ChatBot.Utils;
using Microsoft.Bot.Builder;
using Microsoft.Bot.Configuration;
using Microsoft.Bot.Connector;
using Microsoft.Bot.Schema;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace ChatBot
{
    public class SmartRetailBot : IBot
    {
        public const string DefaultLocalUser = "User";

        private DialogSet _dialogs { get; set; }

        private readonly BotAccessors _accessors;

        private readonly BotConfigOptions _botConfigOptions;

        // Add Luis Recognizer
        private LuisRecognizer _luis;

        public SmartRetailBot(BotAccessors accessors, BotConfigOptions botConfigOptions, ILoggerFactory loggerFactory, IConfiguration configuration, LuisRecognizer luisRecognizer)
        {
            SiteImagesPath = configuration["imageHostUrl"];
            ProductService = new ProductService(configuration);
            SpeechService = new SpeechService(configuration);

            _botConfigOptions = botConfigOptions;
            _accessors = accessors ?? throw new System.ArgumentNullException(nameof(accessors));

            // Initialize the LUIS recognizer
            _luis = luisRecognizer;

            // The DialogSet needs a DialogState accessor, it will call it when it has a turn context.
            _dialogs = new DialogSet(accessors.ConversationDialogState);

            // Dialog for the IWantAWatch Intent
            _dialogs.Add(new IWantANewWatchDialog(_accessors.UserData, configuration, _botConfigOptions));

            // Dialog for the TryWatch Intent
            _dialogs.Add(new TryWatchDialog(_accessors.UserData, configuration));

            // Dialog for the TellMeWhatToWear Intent
            _dialogs.Add(new TellMeWhatToWearDialog(_accessors.UserData, configuration, _botConfigOptions));
        }

        public string SiteImagesPath { get; }

        public ProductService ProductService { get; }

        public SpeechService SpeechService { get; }

        /// <summary>
        /// Every conversation turn for our Echo Bot will call this method.
        /// There are no dialogs used, since it's "single turn" processing, meaning a single
        /// request and response.
        /// </summary>
        /// <param name="turnContext">A <see cref="ITurnContext"/> containing all the data needed
        /// for processing this conversation turn. </param>
        /// <param name="cancellationToken">(Optional) A <see cref="CancellationToken"/> that can be used by other objects
        /// or threads to receive notice of cancellation.</param>
        /// <returns>A <see cref="Task"/> that represents the work queued to execute.</returns>
        /// <seealso cref="BotStateSet"/>
        /// <seealso cref="ConversationState"/>
        /// <seealso cref="IMiddleware"/>
        public async Task OnTurnAsync(ITurnContext turnContext, CancellationToken cancellationToken = default(CancellationToken))
        {
            // Create a dialog context
            var dc = await _dialogs.CreateContextAsync(turnContext);


            // Handle Message activity type, which is the main activity type for shown within a conversational interface
            // Message activities may contain text, speech, interactive cards, and binary or unknown attachments.
            // see https://aka.ms/about-bot-activity-message to learn more about the message and other activity types
            if (turnContext.Activity.Type == ActivityTypes.Message)
            {
                // Continue the current dialog
                var dialogResult = await dc.ContinueDialogAsync(cancellationToken);

                if (!turnContext.Responded)
                {
                    switch (dialogResult.Status)
                    {
                        case DialogTurnStatus.Empty:
                            // Your code goes here
                            // Check LUIS model
                            var luisResults = await _luis.RecognizeAsync(dc.Context, cancellationToken).ConfigureAwait(false);
                            var topIntent = luisResults?.GetTopScoringIntent();
                            var audioAttachmentUrl = BotUtils.GetAudioUploadUrl(turnContext.Activity);
                            if (!string.IsNullOrEmpty(audioAttachmentUrl))
                            {
                                turnContext.Activity.Text = await SpeechService.RecognizeAudioAsync(turnContext.Activity.Attachments[0].ContentUrl);
                            }

                            switch (topIntent?.intent)
                            {
                                case "IWantANewWatch":
                                    await turnContext.SendActivityAsync("I can help you with that! Let me see what I can find");
                                    await DisplayDefaultWatchesAsync(turnContext);
                                    await dc.BeginDialogAsync(nameof(IWantANewWatchDialog));
                                    break;
                                case "TryWatch":
                                    await dc.BeginDialogAsync(nameof(TryWatchDialog));
                                    break;
                                case "Greetings":
                                    await DisplayWelcomeAudioMessageAsync(turnContext, cancellationToken);
                                    break;
                                case "TellMeWhatToWear":
                                    await dc.BeginDialogAsync(nameof(TellMeWhatToWearDialog));
                                    break;
                                default:
                                    await turnContext.SendActivityAsync("Sorry, I didn't understand that.");
                                    break;
                            }

                            break;

                        case DialogTurnStatus.Waiting:
                            // The active dialog is waiting for a response from the user, so do nothing.
                            break;
                        case DialogTurnStatus.Complete:
                            await dc.EndDialogAsync();
                            break;
                        default:
                            await dc.CancelAllDialogsAsync();
                            break;
                    }
                }
            }
            else
            {
                // Add welcome message here
                if (turnContext.Activity.Type == ActivityTypes.ConversationUpdate && turnContext.Activity.MembersAdded.FirstOrDefault()?.Id == turnContext.Activity.Recipient.Id)
                {
                    await turnContext.SendActivityAsync("Hi! How I can help you today?");
                }
            }

            // Save the dialog state into the conversation state.
            await _accessors.ConversationState.SaveChangesAsync(turnContext, false, cancellationToken);

            // Save the user profile updates into the user state.
            await _accessors.UserState.SaveChangesAsync(turnContext, false, cancellationToken);
        }

        private async Task DisplayWelcomeAudioMessageAsync(ITurnContext turnContext, CancellationToken cancellationToken)
        {
            var activity = turnContext.Activity;
            var name = activity.From.Name;
            var reply = activity.CreateReply();
            reply.Text = $"Hi {name}! How can I help you today?";

            var audioResponse = await SpeechService.SynthesizeSpeechAsync(reply.Text);
            var audioAttachment = await BotUtils.CreateAndUploadAttachmentAsync(reply.ServiceUrl, "audio/wav", reply.Conversation.Id, audioResponse, "AudioGreeting", _botConfigOptions);
            var audioCard = BotUtils.CreateAudioCard("Greeting Audio", reply.Text, audioAttachment.ContentUrl).ToAttachment();
            reply.Attachments = new List<Attachment> { audioCard };

            // Store the user name in the User State
            var userData = await _accessors.UserData.GetAsync(turnContext, () => new UserData(), cancellationToken);
            userData.Name = name;

            // Store the gender

            string gender = null;
            if (turnContext.Activity.ChannelData != null)
            {
                var values = ((JObject)turnContext.Activity.ChannelData).ToObject<Dictionary<string, object>>();
                if (values.ContainsKey("gender"))
                {
                    gender = (string)values["gender"];
                    userData.Gender = gender;

                    var imageUrl = gender.Equals("female", StringComparison.InvariantCultureIgnoreCase) ? $"{SiteImagesPath}/greeting/Kiosk_CustomAdvert_ActiveWear.png" : $"{SiteImagesPath}/greeting/Kiosk_CustomAdvert_Xbox.png";

                    var card = new HeroCard
                    {
                        Images = new List<CardImage> { new CardImage(imageUrl) },
                    };

                    reply.Attachments.Add(card.ToAttachment());
                }
            }

            // Send welcome message with attachment
            await turnContext.SendActivityAsync(reply);
        }
        private async Task DisplayDefaultWatchesAsync(ITurnContext context)
        {
            var actions = new[]
            {
                new CardAction(type: ActionTypes.ShowImage, title: "Fabrikam Smart Watch", value: "Fabrikam Smart Watch", image: $"{SiteImagesPath}/watches/SearchResult_Product1.png"),
                new CardAction(type: ActionTypes.ShowImage, title: "Arch Pro - Series 2", value: "Arch Pro - Series 2", image: $"{SiteImagesPath}/watches/SearchResult_Product2.png"),
                new CardAction(type: ActionTypes.ShowImage, title: "V300 Smart Watch", value: "V300 Smart Watch", image: $"{SiteImagesPath}/watches/SearchResult_Product3.png"),
                new CardAction(type: ActionTypes.ShowImage, title: "Litware Tallboy", value: "Litware Tallboy", image: $"{SiteImagesPath}/watches/SearchResult_Product4.png"),
                new CardAction(type: ActionTypes.ShowImage, title: "AdventureWorks X", value: "AdventureWorks X", image: $"{SiteImagesPath}/watches/SearchResult_Product5.png"),
            };

            var cards = actions
              .Select(x => new HeroCard
              {
                  Images = new List<CardImage> { new CardImage(x.Image) },
                  Buttons = new List<CardAction> { x },
              }.ToAttachment())
              .ToList();
            var activity = (Activity)MessageFactory.Carousel(cards, "Watch Catalog");
            await context.SendActivityAsync(activity);
        }
    }
}