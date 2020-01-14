using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Threading;
using System.Threading.Tasks;
using ChatBot.Models;
using ChatBot.Options;
using ChatBot.Services;
using ChatBot.Utils;
using Microsoft.Bot.Builder;
using Microsoft.Bot.Builder.Dialogs;
using Microsoft.Bot.Configuration;
using Microsoft.Bot.Connector;
using Microsoft.Bot.Schema;
using Microsoft.Extensions.Configuration;

namespace ChatBot.Dialogs
{
    public class IWantANewWatchDialog : ComponentDialog
    {
        // Conversation steps
        public const string SearchWatches = "searchWatches";
        public const string ConfirmWatchFound = "confirmWatchFound";
        public const string AskForImage = "askForImage";
        public const string SearchSimilarWatches = "searchSimilarWatches";
        public const string ConfirmationPrompt = "confirm";
        public const int ProcessingDelay = 2000;

        private readonly BotConfigOptions _botConfigOptions;

        public IWantANewWatchDialog(IStatePropertyAccessor<UserData> botStateAccessor, IConfiguration configuration, BotConfigOptions botConfigOptions)
            : base(nameof(IWantANewWatchDialog))
        {
            BotStateAccessor = botStateAccessor ?? throw new ArgumentNullException(nameof(botStateAccessor));
            _botConfigOptions = botConfigOptions;

            SiteImagesPath = configuration["imageHostUrl"];
            TextAnalyticsService = new TextAnalyticsService(configuration["textAnalyticsKey"], configuration["region"]);
            CustomVisionService = new CustomVisionService(configuration["customVisionKey"], configuration["customVisionProjectId"]);
            ProductService = new ProductService(configuration);

            // This array defines how the Waterfall will execute.
            var waterfallSteps = new WaterfallStep[]
            {
                CheckWatchesStepAsync,
                AskforPhotoStepAsync,
                SearchWatchesStepAsync,
            };

            // Add named dialogs to the DialogSet. These names are saved in the dialog state.
            AddDialog(new WaterfallDialog(SearchWatches, waterfallSteps));
            AddDialog(new TextPrompt(ConfirmWatchFound));
            AddDialog(new AttachmentPrompt(AskForImage, ImageValidatorAsync));
            AddDialog(new TextPrompt(SearchSimilarWatches));
        }

        private async Task<bool> ImageValidatorAsync(PromptValidatorContext<IList<Attachment>> promptContext, CancellationToken cancellationToken)
        {
            var userData = await BotStateAccessor.GetAsync(promptContext.Context, () => new UserData(), cancellationToken);
            bool result = false;
            var userInput = promptContext.Recognized.Value;
            if (userInput != null && userInput.Any())
            {
                var remoteFileUrl = userInput[0].ContentUrl;

                // We make the call to the CustomVisionService
                var imageResult = await CustomVisionService.AnalyzeAsync(remoteFileUrl);

                if (imageResult != null)
                {
                    userData.ImageBoundingBox = imageResult.BoundingBox;
                    userData.CroppedImage = await ImageUtils.GetCroppedImageAsync(remoteFileUrl, imageResult.BoundingBox.Left, imageResult.BoundingBox.Top, imageResult.BoundingBox.Width, imageResult.BoundingBox.Height);
                    result = imageResult.TagName.Contains("watch");
                }
            }

            return await Task.FromResult(result);
        }
        public IStatePropertyAccessor<UserData> BotStateAccessor { get; }

        public string SiteImagesPath { get; }

        // Cognitive services
        public TextAnalyticsService TextAnalyticsService { get; }

        public CustomVisionService CustomVisionService { get; }

        public ProductService ProductService { get; }

        // Add Steps
        private async Task<DialogTurnResult> CheckWatchesStepAsync(WaterfallStepContext stepContext, CancellationToken cancellationToken)
        {
            return await stepContext.PromptAsync(ConfirmWatchFound, GenerateConfirmProductOptions(stepContext.Context.Activity), cancellationToken);
        }

        private async Task<DialogTurnResult> AskforPhotoStepAsync(WaterfallStepContext stepContext, CancellationToken cancellationToken)
        {
            var userData = await BotStateAccessor.GetAsync(stepContext.Context, () => new UserData(), cancellationToken);

            // Get the text from the activity to use to show the correct card
            var text = stepContext.Context.Activity.Text.ToLowerInvariant();
            var isPositiveFeedback = await TextAnalyticsService.GetTextSentimentAsync(text) > 0.5;
            userData.ProductWasFound = isPositiveFeedback;

            if (isPositiveFeedback)
            {
                // We go directly to the next step as we don't need any input from the user
                return await stepContext.NextAsync();
            }
            else
            {
                return await stepContext.PromptAsync(
                    AskForImage,
                    new PromptOptions
                    {
                        Prompt = MessageFactory.Text("Do you have a photo of a watch you like? In order to help you we will need an image of a simillar watch to search."),
                        RetryPrompt = MessageFactory.Text("I didn't find any watch on the provided image. Please provide an image with a similar watch you are looking for to continue"),
                    },
                    cancellationToken);
            }
        }

        private async Task<DialogTurnResult> SearchWatchesStepAsync(WaterfallStepContext stepContext, CancellationToken cancellationToken)
        {
            var userData = await BotStateAccessor.GetAsync(stepContext.Context, () => new UserData(), cancellationToken);

            if (userData.ProductWasFound)
            {
                await stepContext.Context.SendActivityAsync("I'm happy that you like them! Please take your time looking at these items. I'm here to help in case of any questions.", cancellationToken: cancellationToken);

                // We end the dialog flow on this step as we don't need any other confirmation at this point.
                return await stepContext.EndDialogAsync(cancellationToken: cancellationToken);
            }
            else
            {
                var activity = stepContext.Context.Activity;
                var file = activity.Attachments[0];
                var reply = activity.CreateReply();

                // Display cropped picture of the watch
                var croppedImageAttachment = await BotUtils.CreateAndUploadAttachmentAsync(reply.ServiceUrl, "image/png", reply.Conversation.Id, userData.CroppedImage.Image, "Cropped Image", _botConfigOptions);
                reply.Attachments = new List<Attachment>() { croppedImageAttachment };
                reply.Text = "I can see the watch. Let me see what we have in stock.";
                await stepContext.Context.SendActivityAsync(reply, cancellationToken);

                var imageBoxCoordinates = userData.ImageBoundingBox;
                var boundingRectangle = await ImageUtils.GetBoundingRectangleAsync(imageBoxCoordinates.Top, imageBoxCoordinates.Left, imageBoxCoordinates.Width, imageBoxCoordinates.Height, file.ContentUrl);

                reply.Attachments = await GetSimilarWatchesAsync(file.ContentUrl, boundingRectangle);
                reply.AttachmentLayout = AttachmentLayoutTypes.Carousel;
                reply.Text = "I found these similar watches. Let me know if you have any questions.";

                // Send the card(s) to the user as an attachment to the activity
                await stepContext.Context.SendActivityAsync(reply, cancellationToken);

                // We end the dialog flow on this step as we don't need any other confirmation at this point.
                return await stepContext.EndDialogAsync(cancellationToken: cancellationToken);
            }
        }

        private async Task<List<Attachment>> GetSimilarWatchesAsync(string imageUrl, BoundingRectangle boundingRectangle)
        {
            var similarProducts = await ProductService.FindSimilarProductsAsync(imageUrl, boundingRectangle);
            var actions = new List<CardAction>();
            foreach (var imageFound in similarProducts)
            {
                actions.Add(new CardAction(type: ActionTypes.ShowImage, title: imageFound.Title, value: imageFound.Title, image: imageFound.Image));
            }

            var cards = actions
                .Select(x => new HeroCard
                {
                    Images = new List<CardImage> { new CardImage(x.Image) },
                    Buttons = new List<CardAction> { x },
                }.ToAttachment())
                .ToList();
            return cards;
        }

        /// <summary>
        /// Creates options so the user can confirm if he found the product that he is looking for.
        /// </summary>
        /// <param name="activity">The message activity the bot received.</param>
        /// <returns>A <see cref="PromptOptions"/> to be used in a prompt.</returns>
        private PromptOptions GenerateConfirmProductOptions(Activity activity)
        {
            var reply = activity.CreateReply("What do you think of these?");
            var actions = new[]
            {
                new CardAction() { Title = "No, not what I'm looking for.", Type = ActionTypes.ImBack, Value = "No, not what I'm looking for." },
                new CardAction() { Title = "These look great!", Type = ActionTypes.ImBack, Value = "These look great!" },
            };
            var cards = actions
             .Select(x => new HeroCard
             {
                 Buttons = new List<CardAction> { x },
             }.ToAttachment())
             .ToList();

            reply.AttachmentLayout = AttachmentLayoutTypes.List;
            reply.Attachments = cards;

            // Create options for the prompt
            var options = new PromptOptions()
            {
                Prompt = reply,
            };

            return options;
        }
    }
}
