# Applied to the verifier bb writes (circuits/build.sh). Word boundaries: [[:<:]] [[:>:]] on macOS sed.
s/[[:<:]]BaseZKHonkVerifier[[:>:]]/QouraCheckBase/g
s/[[:<:]]HonkVerifier[[:>:]]/QouraRedeemCheck/g
s/[[:<:]]HonkVerificationKey[[:>:]]/QouraCheckKey/g
s/[[:<:]]Honk[[:>:]]/QouraProofShape/g
s/[[:<:]]Errors[[:>:]]/QouraCheckErrors/g
s/[[:<:]]FrLib[[:>:]]/QouraFieldOps/g
s/[[:<:]]ZKTranscriptLib[[:>:]]/QouraChallengeTape/g
s/[[:<:]]ZKTranscript[[:>:]]/QouraChallengeState/g
s/[[:<:]]RelationsLib[[:>:]]/QouraConstraintSet/g
s/[[:<:]]CommitmentSchemeLib[[:>:]]/QouraOpeningMath/g
s/[[:<:]]IVerifier[[:>:]]/IQouraRedeemCheck/g
