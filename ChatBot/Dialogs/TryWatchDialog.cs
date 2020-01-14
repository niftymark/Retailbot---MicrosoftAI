using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ChatBot.Models;
using ChatBot.Services;
using ChatBot.Utils;
using Microsoft.Bot.Builder;
using Microsoft.Bot.Builder.Dialogs;
using Microsoft.Bot.Schema;
using Microsoft.Extensions.Configuration;

namespace ChatBot.Dialogs
{
    public class TryWatchDialog : ComponentDialog
    {
        public const int ProcessingDelay = 2000;

        // Try watch stepts
        private const string TryWatchWaterfall = "tryWatchWaterfall";
        private const string ConfirmStore = "confirmStore";
        private const string SelectStoreSchedule = "selectStoreSchedule";
        private const string NamePrompt = "namePrompt";
        private const string BookAppointment = "bookAppointment";

        // Cognitive services
        private readonly TextAnalyticsService _textAnalyticsService;
        private readonly DistanceMatrixService _distanceMatrixService;
        private readonly FaceRecognitionService _faceRecognitionService;

        private readonly int[] scheduleOptions = { 8, 9, 10, 11, 12, 13 };
        private readonly string _origin;
        private readonly string _destination;

        public TryWatchDialog(IStatePropertyAccessor<Models.UserData> userDataStateAccessor, IConfiguration configuration)
            : base(nameof(TryWatchDialog))
        {
            UserStateAccessor = userDataStateAccessor ?? throw new ArgumentNullException(nameof(userDataStateAccessor));

            // Cognitive Services
            _textAnalyticsService = new TextAnalyticsService(configuration["textAnalyticsKey"], configuration["region"]);
            _distanceMatrixService = new DistanceMatrixService(configuration["bingMapsApiKey"]);
            _faceRecognitionService = new FaceRecognitionService(configuration["faceRecognitionKey"], configuration["region"]);

            // Preset latitud and longitude for testing.
            _origin = $"{configuration["userLatitude"]},{configuration["userLongitude"]}";
            _destination = $"{configuration["storeLatitude"]},{configuration["storeLongitude"]}";

            // Define Waterfallsteps for the new TryWatch dialog
            var tryWatchWaterfallSteps = new WaterfallStep[]
            {
              SearchClosestStoreStepAsync,
              CheckStoreCalendarStepAsync,
              NamePromptStepAsync,
              BookAppointmentStepAsync,
              SaveSelfieStepAsync,
            };

            AddDialog(new WaterfallDialog(TryWatchWaterfall, tryWatchWaterfallSteps));
            AddDialog(new TextPrompt(ConfirmStore));
            AddDialog(new TextPrompt(SelectStoreSchedule));
            AddDialog(new TextPrompt(NamePrompt));
            AddDialog(new AttachmentPrompt(BookAppointment));
        }

        public IStatePropertyAccessor<Models.UserData> UserStateAccessor { get; }

        private List<Attachment> GenerateYesNoCards()
        {
            var actions = new[]
            {
                new CardAction() { Title = "Yes", Type = ActionTypes.ImBack, Value = "Yes" },
                new CardAction() { Title = "No", Type = ActionTypes.ImBack, Value = "No" },
            };

            return actions
                .Select(x => new HeroCard
                {
                    Buttons = new List<CardAction> { x },
                }.ToAttachment())
                .ToList();
        }

        private async Task<DialogTurnResult> SearchClosestStoreStepAsync(WaterfallStepContext stepContext, CancellationToken cancellationToken)
        {
            var userData = await UserStateAccessor.GetAsync(stepContext.Context, () => new Models.UserData(), cancellationToken);

            await stepContext.Context.SendActivityAsync("Of course! I can help you set up an appointment.");
            Thread.Sleep(ProcessingDelay);
            await stepContext.Context.SendActivityAsync("Searching through our team of 1300 associates...");
            Thread.Sleep(ProcessingDelay);
            await stepContext.Context.SendActivityAsync("Found 14 local expert watch associates...");

            var travelData = await _distanceMatrixService.GetRouteMatrixByLocationAndTimeAsync(_origin, _destination);
            var travelDistance = travelData.ResourceSets.FirstOrDefault()?.Resources.FirstOrDefault()?.Results.FirstOrDefault()?.TravelDistance;
            if (travelDistance != null)
            {
                travelDistance = Math.Round(travelDistance.Value);
            }
            else
            {
                // Harcoded value in case the service returns null
                travelDistance = 10;
            }

            await stepContext.Context.SendActivityAsync($"Your closest store is {travelDistance} miles way at the Contoso Mall.", cancellationToken: cancellationToken);

            var reply = stepContext.Context.Activity.CreateReply("Is this ok?");
            reply.AttachmentLayout = AttachmentLayoutTypes.List;
            reply.Attachments = GenerateYesNoCards();

            return await stepContext.PromptAsync(ConfirmStore, new PromptOptions { Prompt = reply }, cancellationToken);
        }

        private async Task<DialogTurnResult> CheckStoreCalendarStepAsync(WaterfallStepContext stepContext, CancellationToken cancellationToken)
        {
            var userData = await UserStateAccessor.GetAsync(stepContext.Context, () => new Models.UserData(), cancellationToken);
            var textResult = ((string)stepContext.Result).ToLowerInvariant();

            var isPositiveFeedback = await _textAnalyticsService.GetTextSentimentAsync(textResult) > 0.5;
            userData.IsStoreSelectionOk = isPositiveFeedback;

            if (isPositiveFeedback)
            {
                await stepContext.Context.SendActivityAsync("Checking calendars...", cancellationToken: cancellationToken);

                var recommendation = await GetAppointmentScheduleRecommendationAsync(_origin, _destination);
                var reply = stepContext.Context.Activity.CreateReply($"I have team members available during the following time slots. {recommendation}");
                var actions = new[]
                {
                    new CardAction() { Title = "8:00 a.m. - 9:00 a.m.", Type = ActionTypes.ImBack, Value = "8:00 a.m. - 9:00 a.m." },
                    new CardAction() { Title = "9:00 a.m. - 10:00 a.m.", Type = ActionTypes.ImBack, Value = "9:00 a.m. - 10:00 a.m." },
                    new CardAction() { Title = "10:00 a.m. - 11:00 a.m.", Type = ActionTypes.ImBack, Value = "10:00 a.m. - 11:00 a.m." },
                    new CardAction() { Title = "11:00 a.m. - 12:00 p.m.", Type = ActionTypes.ImBack, Value = "11:00 a.m. - 12:00 p.m." },
                    new CardAction() { Title = "12:00 p.m. - 1:00 p.m.", Type = ActionTypes.ImBack, Value = "12:00 p.m. - 1:00 p.m." },
                    new CardAction() { Title = "1:00 p.m. - 2:00 a.m.", Type = ActionTypes.ImBack, Value = "1:00 p.m. - 2:00 a.m." },
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

                return await stepContext.PromptAsync(SelectStoreSchedule, options, cancellationToken);
            }
            else
            {
                return await SaveSelfieStepAsync(stepContext, cancellationToken);
            }
        }

        private async Task<DialogTurnResult> NamePromptStepAsync(WaterfallStepContext stepContext, CancellationToken cancellationToken)
        {
            var userData = await UserStateAccessor.GetAsync(stepContext.Context, () => new Models.UserData(), cancellationToken);

            // Get the text from the activity to use to show the correct card
            var text = stepContext.Context.Activity.Text.ToLowerInvariant();

            // Let's save the user's schedule in case we need it later.
            userData.SelectedSchedule = text;

            return await stepContext.PromptAsync(NamePrompt, new PromptOptions { Prompt = MessageFactory.Text("what is your name?") }, cancellationToken);
        }

        private async Task<DialogTurnResult> BookAppointmentStepAsync(WaterfallStepContext stepContext, CancellationToken cancellationToken)
        {
            var userData = await UserStateAccessor.GetAsync(stepContext.Context, () => new Models.UserData(), cancellationToken);

            var text = stepContext.Context.Activity.Text;
            userData.Name = text;

            // Create a person using the customer information
            var personId = await _faceRecognitionService.CreatePersonAsync(userData.Name);
            userData.PersonId = personId.ToString();

            await stepContext.Context.SendActivityAsync("Great! I've booked you in.", cancellationToken: cancellationToken);

            return await stepContext.PromptAsync(BookAppointment, new PromptOptions { Prompt = MessageFactory.Text("Take a selfie if you'd like our team to be able to recognize you on your arrival") }, cancellationToken);
        }

        private async Task<DialogTurnResult> SaveSelfieStepAsync(WaterfallStepContext stepContext, CancellationToken cancellationToken)
        {
            var userData = await UserStateAccessor.GetAsync(stepContext.Context, () => new Models.UserData(), cancellationToken);
            if (userData.IsStoreSelectionOk)
            {
                var activity = stepContext.Context.Activity;
                var reply = activity.CreateReply();
                var msg = string.Empty;
                if (activity.Attachments != null && activity.Attachments.Any())
                {
                    var file = activity.Attachments[0];
                    var personId = Guid.Parse(userData.PersonId);
                    var image = await ImageUtils.GetImageStreamAsync(file.ContentUrl);

                    // Add Face to Person
                    await _faceRecognitionService.AddPersonFaceAsync(personId, image);

                    msg = $"Thanks {userData.Name}!";
                }
                else
                {
                    msg = "I can’t find your photo. Please try again.";
                }

                await stepContext.Context.SendActivityAsync(msg, cancellationToken: cancellationToken);
            }
            else
            {
                await stepContext.Context.SendActivityAsync("I am sorry that's the closest store.", cancellationToken: cancellationToken);
            }

            return await stepContext.EndDialogAsync(cancellationToken: cancellationToken);
        }

        private async Task<string> GetAppointmentScheduleRecommendationAsync(string origin, string destination)
        {
            var today = DateTime.UtcNow.ToString("yyyy-MM-dd");
            var higherScheduleHour = 0;
            var higherScheduleDuration = 0.0;

            foreach (var schedule in scheduleOptions)
            {
                // Use Distance Matrix to get the time slot with highest duration
                var travelData = await _distanceMatrixService.GetRouteMatrixByLocationAndTimeAsync(origin, destination, $"{today}T{schedule:00}:00:00");
                var duration = travelData.ResourceSets.FirstOrDefault()?.Resources.FirstOrDefault()?.Results.FirstOrDefault()?.TravelDuration;
                if (duration != null && duration > higherScheduleDuration)
                {
                    higherScheduleHour = schedule;
                    higherScheduleDuration = duration.Value;
                }
            }

            return $"Traffic is worst between {GetHourInterval(higherScheduleHour)}. I recommend avoiding this time.";
        }

        private string GetHourInterval(int initialHour)
        {
            var nextHour = initialHour + 1;
            return (initialHour < 13 ? initialHour : initialHour - 12) + ":00" + (initialHour < 12 ? " a.m." : " p.m.") + " - " + (nextHour < 13 ? nextHour : nextHour - 12) + ":00" + (nextHour < 12 ? " a.m." : " p.m.");
        }
    }
}
